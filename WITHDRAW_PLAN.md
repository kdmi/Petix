# WITHDRAW_PLAN.md — Вывод Points → $PETIX (on-chain выплата)

> Готовим вывод так, чтобы **в день запуска токена** всё переключилось максимально быстро.
> Сейчас тестируем на тестовом токене (pump.fun), на запуске меняем mint+treasury и включаем рубильник.
> Модалка Withdraw уже есть (admin-only, привязана к `economy-config`) — здесь делаем, чтобы она **реально работала**.

## Статус (2026-06-23)

**Модель: custodial-push** (перешли с co-sign). Раньше игрок сам подписывал co-sign транзакцию (платил газ) — но Phantom показывал красное «dApp may be malicious» на подпись заранее собранной tx с нового домена `petix.fun`, что отпугивало. Решение: **сервер сам отправляет токены** (`sendWithdrawFromTreasury` — treasury = fee payer + источник, полностью подписывает и шлёт), **игрок ничего не подписывает → нет промпта/предупреждения**. Цена: газ + аренду ATA (~0.002 SOL/новый кошелёк) платим мы, поэтому **казне нужен SOL**.

**Реализовано и проверено:** ядро `api/_lib/withdraw.js` (авто-детект Token-2022/classic), единый эндпоинт `POST /api/withdraw/request` (резерв-дебет → отправка → подтверждение → возврат при сбое) + `config`; `withdrawals` в профиле (`withdrawal-store.js`/`store.js`); `WITHDRAW_ENABLED` (0=admin-only, 1=всем) + `WITHDRAW_FEE_PCT` (дефолт 0) в `economy-config`; фронт модалки — один вызов `request` без web3.js/подписи, Solscan, ошибки. **Проверено реальным custodial-выводом на mainnet** (sig подтверждён, 200 токенов ушли с казны, Points списались/возвращаются), 155/155 тестов.

**Тест-токен (mainnet pump.fun):** Token-2022, 6 decimals, без fee/hook/freeze. ⚠️ Первый тест-кошелёк `8u7GVy…DPyv` был **слит** (ключ скомпрометирован, не через наш код) — заменён новым `2aqaFd…7LLa`. На запуске — отдельный надёжный кошелёк, ключ только в env, схема холодный пул + горячий раздатчик.

**Осталось:** закоммитить custodial-код → мёрж → прод (env уже обновлены). Опц.: баланс казны в админке; заявка в Phantom/Blowfish на снятие флага (для co-sign была критична, для custodial — нет, т.к. подписи нет).

## 1. Цель

Игрок видит свой баланс Points, жмёт **Withdraw**, подписывает транзакцию в своём кошельке —
и получает **ровно столько же** реальных $PETIX (1:1, без комиссии) на тот кошелёк, которым авторизован.
Мы при этом **не платим ни SOL за газ, ни аренду за ATA**.

## 2. Решения (зафиксировано в интервью)

| # | Решение | Источник |
|---|---------|----------|
| 1 | **Co-sign транзакция, без кастомного контракта.** Стандартный SPL-`transferChecked`: игрок = fee payer, наш treasury = источник токенов и со-подписант. | Интервью Q1 |
| 2 | **Газ и аренду ATA платит игрок.** Мы тратим 0 SOL. Это и есть защита «не разориться на комиссиях». | Интервью Q1 |
| 3 | **Курс ровно 1:1, комиссия 0%.** `WITHDRAW_FEE_PCT=0` (остаётся настраиваемым в админке как рычаг на будущее). | Интервью Q2 |
| 4 | **Тайминг — синхронно по клику.** Игрок подписывает в кошельке сам, «фоновый воркер» за него подписать не может. Бэкенд лишь собирает/частично подписывает tx и ведёт статус (это не нагружает сервера). | Интервью Q3+Q5 |
| 5 | **Без Twitter-гейта.** Отступаем от FR-022 спеки — гейта нет. | Интервью Q6 |
| 6 | **Лимит только минимальный порог `MIN_WITHDRAW=200`** (из `economy-config`). Дневных/общих лимитов нет. | Интервью Q7 |
| 7 | **Сброса балансов нет.** Сейчас балансы пустые/тестовые — тестируем на текущих, нигде в проде не показывается. | Интервью Q4 |
| 8 | **Рамки рантайма решаю я:** env для секретов/инфры (redeploy), рубильник `WITHDRAW_ENABLED` в админке (мгновенно). | Интервью Q8 |
| 9 | **Destination = авторизованный кошелёк** (`session.wallet`). Поля ввода адреса нет — совпадает с макетом. | Производное |

## 3. Почему так дёшево (минимизация комиссий)

На Solana при выплате SPL-токена есть две статьи расхода:
- **Базовая комиссия tx** — ~5000 lamports (~$0.001). Мизер.
- **Аренда ATA получателя** — ~0.00204 SOL (~$0.30–0.40), **разово** на кошелёк, если у получателя ещё нет токен-аккаунта под $PETIX. Это главный потенциальный расход.

В co-sign модели **обе статьи оплачивает игрок** (он — fee payer и плательщик аренды своего ATA),
поэтому при любом числе выводов и любых сибилах **наш расход в SOL = 0**. Никаких gasless-спонсирований,
никаких удержаний в дешёвом токене. Игроку нужен лишь небольшой SOL на кошельке (≈ $0.30–0.40 в первый раз,
далее ~$0.001) — это нормальная практика Solana и обрабатывается понятной ошибкой при нехватке SOL.

## 4. Архитектура (co-sign, без программы)

### 4.1. Поток вывода (happy path)
1. **Игрок** в модалке выбирает сумму `amount` (Points) и жмёт **Withdraw**.
2. **Фронт → `POST /api/withdraw/prepare { amount }`.**
3. **Бэкенд (`prepare`)**:
   - проверяет: вывод включён (`WITHDRAW_ENABLED`), `amount ≥ MIN_WITHDRAW`, `amount ≤ доступный баланс`;
   - **резервирует (списывает) Points** через `updateWalletProfile` (анти-double-spend), создаёт `WithdrawalRecord(status="prepared")` с `reservedPoints`, `expiresAt`;
   - строит транзакцию: `feePayer = playerPubkey`; инструкции:
     - (если у игрока нет ATA под mint) `createAssociatedTokenAccountInstruction(payer=player, owner=player, mint)` — **аренду платит игрок**;
     - `createTransferCheckedInstruction(source=treasuryATA, mint, dest=playerATA, owner=treasury, amount×10^decimals, decimals)`;
   - ставит свежий `recentBlockhash`, **частично подписывает ключом treasury** (`partialSign`), сериализует (`requireAllSignatures:false`) в base64;
   - отвечает `{ recordId, txBase64, blockhash, lastValidBlockHeight }`.
4. **Фронт**: `provider.signAndSendTransaction(deserialize(txBase64))` — кошелёк игрока добавляет подпись fee payer и **сам отправляет** tx, возвращает `signature`.
5. **Фронт → `POST /api/withdraw/confirm { recordId, signature }`** (отправляем сигнатуру сразу после сабмита).
6. **Бэкенд (`confirm`)**: подтверждает tx по сигнатуре (RPC `getSignatureStatuses`/`getTransaction`), проверяет соответствие (mint, dest=player, amount), помечает `status="confirmed"`, сохраняет `signature`.
7. **Фронт**: показывает success-экран модалки + ссылку на Solscan.

### 4.2. Отмена / сбой / брошенная заявка (refund)
Резерв-списание делается на шаге 3, поэтому Points защищены от двойной траты. Возврат:
- **Игрок отклонил подпись / ошибка кошелька** → фронт `POST /api/withdraw/cancel { recordId }` → бэкенд **возвращает Points**, `status="canceled"`.
- **`confirm` показал, что tx не прошла** → возврат Points, `status="failed"`.
- **Игрок закрыл вкладку, сигнатуру не прислал** → ленивый реконсилер: при следующем чтении баланса/новой заявке любая запись `status="prepared"` с истёкшим blockhash (`lastValidBlockHeight` пройден) и не найденная on-chain → **безопасно вернуть Points** (tx с истёкшим blockhash уже никогда не подтвердится). Без крона — лениво, как farm-аккруал.

### 4.3. Доступный баланс
`available = currency.balance` (Points списываются сразу при `prepare`, поэтому отдельный учёт «зарезервировано» не нужен — баланс уже уменьшен; возврат при отмене просто прибавляет обратно). Истёкшие `prepared`-записи реконсилятся лениво.

## 5. Данные

### 5.1. WithdrawalRecord (новый стор `withdrawal-store.js`, dev/prod дуальный как `battle-store.js`)
| Поле | Тип | Описание |
|------|-----|----------|
| `id` | string | uuid заявки |
| `wallet` | string | кошелёк игрока (он же destination) |
| `points` | integer | списанные Points (= отправляемые $PETIX при 1:1, fee=0) |
| `feePct` | number | применённая комиссия (сейчас 0) |
| `petixSent` | integer | фактически отправлено $PETIX |
| `status` | enum | `prepared` → `confirmed` / `failed` / `canceled` |
| `signature` | string | сигнатура tx (после confirm) |
| `mint` | string | mint токена (для аудита, какой токен слали) |
| `blockhash` / `lastValidBlockHeight` | — | для реконсиляции истечения |
| `createdAt` / `updatedAt` | timestamp | — |

(Совпадает с E6 `WithdrawalRecord` из спеки, минус `twitterHandle`.)

### 5.2. Списание/возврат Points
Только через `updateWalletProfile(wallet, mutator)` (сериализация по кошельку). `prepare` — дебет, `cancel/failed/expire` — кредит. Мутатор `throw`-ит при недостатке баланса → 4xx без записи.

## 6. Конфиг и секреты

### 6.1. ENV (инфра/секреты — задаются один раз, меняются деплоем)
| Переменная | Назначение |
|-----------|------------|
| `SOLANA_RPC_URL` | Mainnet RPC. Тест — публичный `api.mainnet-beta.solana.com`; бой — бесплатный ключ Helius/QuickNode (`https://mainnet.helius-rpc.com/?api-key=...`). Нужен только бэкенду. |
| `SOLANA_TREASURY_SECRET` | Приватный ключ кошелька-**раздатчика** (base58). Хранение — **Vercel env vars** (как AI-ключи). Не в blob/админку/логи. |
| `PETIX_MINT` | Mint-адрес токена $PETIX |
| `PETIX_DECIMALS` | Decimals токена (pump.fun = 6 — подтвердить по mint) |
| `SOLANA_NETWORK` | `mainnet-beta` (pump.fun — mainnet) |

### 6.2. Runtime (админка, мгновенно без деплоя)
- `WITHDRAW_ENABLED` (bool, в `economy-config`) — рубильник вывода. По умолчанию `false`. На запуске включаем после проверки.
- `MIN_WITHDRAW` (есть), `WITHDRAW_FEE_PCT` (есть, = 0).

> Опция на будущее: вынести `PETIX_MINT` в runtime-config (admin-editable), чтобы запуск был вообще без редеплоя — но treasury-ключ в любом случае останется в env.

## 7. Эндпоинты (двухслойно: `api/withdraw/[action].js` → `server-routes/withdraw/*`)
- `POST /api/withdraw/prepare` → `server-routes/withdraw/prepare.js`
- `POST /api/withdraw/confirm` → `server-routes/withdraw/confirm.js`
- `POST /api/withdraw/cancel`  → `server-routes/withdraw/cancel.js`
- (опц.) `GET /api/withdraw/config` → отдаёт `{ enabled, min, feePct, tokenSymbol, decimals }` для модалки (вместо текущего чтения admin economy-config; вывод станет доступен не только админу).

Все — через `handleCors` + сессия (`getSessionFromRequest`); destination всегда `session.wallet`.

## 8. Бэкенд-логика (`api/_lib/withdraw.js` — новый)
- Зависимости: `@solana/web3.js`, `@solana/spl-token` (добавить в `package.json`).
- `getTreasuryKeypair()` из `SOLANA_TREASURY_SECRET`.
- `buildWithdrawTx({ playerPubkey, amountPoints })`: ATA-резолв, create-ATA-if-missing (payer=player), `transferChecked`, blockhash, `partialSign(treasury)`, сериализация.
- `confirmWithdrawTx(signature, expected)`: статус + валидация перевода.
- Маппинг Points → base units: `BigInt(points) * 10n ** BigInt(decimals)`.
- Проверка платёжеспособности treasury: `getTokenAccountBalance(treasuryATA) ≥ amount` — иначе `503 "withdraw temporarily unavailable"`.

## 9. Фронтенд (правки в `pet-creation/app.js`, модалка уже есть)
- В `onWithdrawSubmit()`: вместо клиентского success — реальный поток `prepare → signAndSendTransaction → confirm`.
- Использовать уже резолвящийся провайдер (`window.phantom.solana` и т.п.); проверить наличие `signAndSendTransaction`.
- Состояния: загрузка («Подтвердите в кошельке…»), success (с Solscan-ссылкой), ошибки: вывод выключен, < порога, нет SOL на газ, отклонено, treasury пуст, tx не прошла.
- Снять admin-only ограничение **после** включения вывода (либо оставить admin-only на время теста — по флагу).
- Десериализация tx на фронте: добавить лёгкий `@solana/web3.js` (или собрать минимальный helper), т.к. сейчас на фронте Solana-SDK нет.

## 10. Безопасность и риски
- **Hot key раздатчика (Vercel env).** Бэкенд держит приватный ключ для подписи в Vercel env vars (как AI-ключи). Поверх — архитектурная защита: **кошелёк-раздатчик** держит только рабочий запас токенов + минимум SOL; основной пул на **холодном** кошельке (его ключ на сервере не хранится), который лишь докидывает токены на раздатчик. Утечка env → потери ограничены запасом раздатчика, не всем пулом. Ключ не в blob/админке/логах.
- **Идемпотентность / double-spend.** Резерв-дебет на `prepare` + сериализация по кошельку (`updateWalletProfile`). Реконсиляция по blockhash-истечению.
- **Платёжеспособность пула.** Treasury должен держать ≥ суммарно выводимых Points. Добавить в админку: баланс treasury vs суммарные outstanding Points; при нехватке — мягкий отказ.
- **«Submitted, но сигнатура не дошла».** Окно крошечное (сигнатуру шлём сразу после сабмита); реконсилер консервативен (возврат только при истёкшем blockhash и отсутствии tx on-chain).
- **pump.fun токен.** Стандартный SPL (Token program, не Token-2022), свободно переводится даже на бондинг-кривой. Подтвердить decimals и что это classic Token program.

## 11. Админка (доп.)
- Тумблер `WITHDRAW_ENABLED` в разделе Economy.
- Баланс treasury (токены + SOL) и суммарные outstanding Points.
- Журнал `WithdrawalRecord` (статусы, суммы, сигнатуры, Solscan-ссылки).

## 12. План тестирования (сейчас, на тестовом токене)
pump.fun — это **mainnet**, поэтому тест идёт на mainnet с «мусорным» тест-токеном (те самые 100M):
1. Заполнить env тестовыми значениями (тест-mint, ключ тест-treasury с 100M, mainnet RPC).
2. Включить `WITHDRAW_ENABLED`, оставить admin-only.
3. С тестового кошелька (с небольшим SOL) вывести ≥200 → подтвердить в Phantom → проверить приход токенов и Solscan.
4. Кейсы: < порога; нет SOL на газ; отклонение подписи; повторный вывод (ATA уже есть → дешевле); пустой treasury.

## 13. ✅ Что мне нужно от тебя (launch-day и для теста)
Формат одинаковый, меняются только значения. **Для теста сейчас:**
1. **Mint-адрес тестового токена** (тот, где 100M).
2. **Приватный ключ кошелька** с этими 100M (base58 / массив байт) — он станет treasury для теста. *(Заведи под это отдельный кошелёк, не основной.)*
3. **RPC URL** (mainnet). Если нет — возьму public mainnet как временный, но лучше бесплатный ключ Helius/QuickNode.
4. Decimals токена (если не 6).

**В день запуска — поменять только:**
1. `PETIX_MINT` → боевой mint (с pump.fun).
2. `SOLANA_TREASURY_SECRET` → ключ боевого кошелька с закупленными $PETIX.
3. Передеплой (env), затем в админке включить `WITHDRAW_ENABLED`.
> То есть на запуске от тебя нужны: **боевой mint + кошелёк-казначей с токенами (его ключ)**. Всё остальное уже будет готово и протестировано.

## 14. Открытые вопросы / допущения
- [x] **devnet не нужен** — всё на mainnet (pump.fun). ✅
- [x] **Хранение ключа** — Vercel env vars (как AI-ключи) + отдельный кошелёк-раздатчик с ограниченным запасом. ✅
- [x] **RPC** — тест на публичном `api.mainnet-beta.solana.com`; к запуску бесплатный ключ Helius/QuickNode (URL даёт владелец). ✅
- [ ] Decimals токена = 6? *(допущение pump.fun: да — подтвердить по mint)*
- [ ] На время теста вывод оставляем admin-only, открываем всем после проверки? *(допущение: да)*
- [ ] Нужен ли журнал выводов в админке в этом релизе или позже? *(допущение: базовый — да)*

## 15. Вне скоупа (сейчас)
- Покупка Points за $PETIX (on-ramp), Twitter-гейт, сброс балансов, decay, дневные лимиты, claim-программа/distributor.

## 16. Этапность реализации
1. **Инфра:** deps (`@solana/web3.js`, `@solana/spl-token`), `api/_lib/withdraw.js`, env-чтение, `WITHDRAW_ENABLED` в `economy-config`.
2. **Стор:** `withdrawal-store.js` + резерв-дебет/возврат через `updateWalletProfile`.
3. **Эндпоинты:** `prepare` / `confirm` / `cancel` (+ `config`).
4. **Фронт:** реальный поток в модалке + состояния/ошибки + Solscan.
5. **Реконсиляция** истёкших `prepared` (ленивая).
6. **Админка:** тумблер + баланс treasury + журнал.
7. **Тест** на тест-токене по разделу 12.
8. **Запуск:** свап env (mint+treasury) + включение рубильника.

// Season 1 boss roster. Art, names, collections and links come from the Figma asset sheet (10 columns, 2026-10-07).
// Each boss ships: `img` — square portrait for the season map, composed like the Figma frame (`bg` colour + `art` offsets
// in % of the frame); `hero` / `squadBg` — 16:9 images for the modal, the battle boss card and the backdrop behind the squad.
// `name` is the partner collection, `title` is the boss; `url` is the collection page (shown as a link in the modal).
// Stats calibrated 2026-09-28 with calibrate.js against real wallets (see DESIGN.md §6). `power` is the hit the boss lands after
// every player move (grows 3% per hit); `shields` must be broken before HP takes damage; `par` is the fixed turn limit for the
// third star, calibrated so a squad one tier above the boss's clear tier makes it in ~45% of wins.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EXPEDITION_BOSSES = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function boss(n, title, name, slug, bg, art, stats) {
    return {
      title: title, name: name, url: 'https://opensea.io/collection/' + slug,
      img: 'map/' + n + '.png', hero: 'bosses/hero/' + n + '-hero.jpg', squadBg: 'bosses/hero/' + n + '-squad.jpg',
      bg: bg, art: art,
      hp: stats[0], power: stats[1], shields: stats[2], par: stats[3]
    };
  }
  return [
    boss(1, 'Sporebeak', 'Rubber Hoodie Ducks', 'rubber-hoodie-ducks', '#caf3fd', [5.7, 4.9, 86.3], [2600, 9, 2, 18]),
    boss(2, 'Minty Pix', 'Pixel Hood Minis', 'pixelhoodminis', '#d5f7df', [-1.3, -3.15, 102.6], [3600, 17, 3, 22]),
    boss(3, 'Mr. Pressstart', 'Never Fucking Trade', 'never-fucking-trade', '#d1d1fd', [6.9, 5, 86.2], [5000, 29, 4, 27]),
    boss(4, 'Jean Phil', 'Jean Phil NFT', 'jeanphil-nft', '#fce2cb', [2.7, 3.3, 95.6], [5600, 36, 4, 26]),
    boss(5, 'Nova Bro', 'STARHOODZ', 'starhoodz', '#e4e6fd', [10, 9.3, 79.9], [6200, 42, 5, 25]),
    boss(6, 'Chainface', 'OnChainHoodies', 'onchainhoodies-', '#eef991', [4.9, 3.4, 90.1], [6800, 50, 7, 26]),
    boss(7, 'Hatlaw', 'WIF Outlaws', 'wif-outlaws', '#c1e7fc', [2.2, 1.9, 95.6], [9500, 58, 6, 26]),
    boss(8, 'Ninja Bear', 'Clay StonKz', 'claystonkz', '#f7d1cc', [10.2, 7.6, 78.5], [9500, 68, 7, 24]),
    boss(9, 'Forest Hero', 'CCFF00', 'ccff00-161927574', '#ccff00', [0, -5.2, 100], [11500, 80, 8, 24]),
    boss(10, 'Sad Cat', 'Cash Cats', 'cashcatss', '#feebd9', [0.2, -3.5, 100.2], [13000, 95, 8, 22])
  ];
});

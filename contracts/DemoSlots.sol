// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC721Enumerable} from "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title DemoSlots — a fixed-supply collection of empty "slots".
/// @notice Every token is minted blank; what a slot contains is defined
///         entirely by the off-chain metadata endpoint behind `baseURI`.
///         The `service` address may only signal metadata refreshes
///         (ERC-4906); collection administration stays with the owner.
contract DemoSlots is ERC721Enumerable, ERC2981, Ownable, IERC4906 {
    using Strings for uint256;

    uint256 public constant MAX_SUPPLY = 100;

    uint256 public mintPrice;
    uint256 public walletLimit;
    address public service;
    uint256 public nextTokenId = 1;
    mapping(address => uint256) public mintedBy;

    string private _baseTokenURI;

    error SoldOut();
    error WalletLimitReached();
    error WrongPrice();
    error WithdrawFailed();
    error NotService();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        address service_,
        uint96 royaltyBps_,
        uint256 walletLimit_,
        uint256 mintPrice_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
        service = service_;
        walletLimit = walletLimit_;
        mintPrice = mintPrice_;
        _setDefaultRoyalty(msg.sender, royaltyBps_);
    }

    modifier onlyService() {
        if (msg.sender != service) revert NotService();
        _;
    }

    /// @notice Public mint, one token per call. Send exactly `mintPrice`.
    function mint() external payable {
        if (nextTokenId > MAX_SUPPLY) revert SoldOut();
        if (mintedBy[msg.sender] >= walletLimit) revert WalletLimitReached();
        if (msg.value != mintPrice) revert WrongPrice();
        mintedBy[msg.sender] += 1;
        uint256 tokenId = nextTokenId;
        nextTokenId += 1;
        _safeMint(msg.sender, tokenId);
    }

    /// @notice Owner-only bulk mint: free and exempt from `walletLimit`, so the
    ///         collection can be minted out for marketplace listing WITHOUT
    ///         opening a free public mint (bots snipe those within seconds).
    function ownerMint(uint256 quantity) external onlyOwner {
        if (nextTokenId + quantity - 1 > MAX_SUPPLY) revert SoldOut();
        for (uint256 i = 0; i < quantity; i += 1) {
            uint256 tokenId = nextTokenId;
            nextTokenId += 1;
            _safeMint(msg.sender, tokenId);
        }
    }

    /// @notice Sends the whole mint revenue to `to`. Without this the ETH
    ///         paid by minters would be locked in the contract forever.
    function withdraw(address payable to) external onlyOwner {
        (bool ok, ) = to.call{value: address(this).balance}("");
        if (!ok) revert WithdrawFailed();
    }

    function setMintPrice(uint256 mintPrice_) external onlyOwner {
        mintPrice = mintPrice_;
    }

    function notifyMetadataUpdate(uint256 tokenId) external onlyService {
        emit MetadataUpdate(tokenId);
    }

    function notifyBatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId) external onlyService {
        emit BatchMetadataUpdate(fromTokenId, toTokenId);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        emit BatchMetadataUpdate(1, MAX_SUPPLY);
    }

    function setService(address service_) external onlyOwner {
        service = service_;
    }

    function setWalletLimit(uint256 walletLimit_) external onlyOwner {
        walletLimit = walletLimit_;
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    /// @notice Collection-level metadata (marketplace collection pages).
    function contractURI() external view returns (string memory) {
        return string.concat(_baseTokenURI, "collection");
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721Enumerable, ERC2981, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}

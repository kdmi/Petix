// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {IERC4906} from "@openzeppelin/contracts/interfaces/IERC4906.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ExpeditionTrophies — boss NFTs of Petix Expeditions (feature 026).
/// @notice One token per wallet per boss, minted only by the server-side
///         `minter` after a verified 3★ run. What a trophy looks like lives in
///         the off-chain metadata behind `baseURI` (replaceable, ERC-4906).
///         All seasons share this one collection; `bossOf` keeps the link.
contract ExpeditionTrophies is ERC721, ERC2981, Ownable, IERC4906 {
    address public minter;
    uint256 public nextTokenId = 1;

    /// tokenId → boss id (season-wide numbering, 1-based)
    mapping(uint256 => uint256) public bossOf;
    /// boss id → wallet → already holds a trophy for this boss
    mapping(uint256 => mapping(address => bool)) public claimed;
    /// boss id → trophies minted so far (serial number source)
    mapping(uint256 => uint256) public mintedFor;

    string private _baseTokenURI;

    event TrophyMinted(address indexed to, uint256 indexed bossId, uint256 indexed tokenId, uint256 serial);
    event MinterChanged(address indexed minter);

    error NotMinter();
    error AlreadyClaimed();
    error BadBoss();

    constructor(
        string memory name_,
        string memory symbol_,
        string memory baseURI_,
        address minter_,
        uint96 royaltyBps_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        _baseTokenURI = baseURI_;
        minter = minter_;
        _setDefaultRoyalty(msg.sender, royaltyBps_);
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    /// @notice Server-side mint after a verified 3★ run. Reverts if `to`
    ///         already holds a trophy for `bossId` — the guard the player can
    ///         rely on even if the server is wrong.
    function mint(address to, uint256 bossId) external onlyMinter returns (uint256 tokenId) {
        if (bossId == 0) revert BadBoss();
        if (claimed[bossId][to]) revert AlreadyClaimed();
        claimed[bossId][to] = true;
        tokenId = nextTokenId;
        nextTokenId += 1;
        mintedFor[bossId] += 1;
        bossOf[tokenId] = bossId;
        _safeMint(to, tokenId);
        emit TrophyMinted(to, bossId, tokenId, mintedFor[bossId]);
    }

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
        emit MinterChanged(minter_);
    }

    /// @notice Changing the metadata endpoint (or the art behind it) — tells
    ///         marketplaces to refresh every token.
    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _baseTokenURI = baseURI_;
        if (nextTokenId > 1) emit BatchMetadataUpdate(1, nextTokenId - 1);
    }

    function notifyMetadataUpdate(uint256 tokenId) external onlyMinter {
        emit MetadataUpdate(tokenId);
    }

    function notifyBatchMetadataUpdate(uint256 fromTokenId, uint256 toTokenId) external onlyMinter {
        emit BatchMetadataUpdate(fromTokenId, toTokenId);
    }

    function setDefaultRoyalty(address receiver, uint96 feeNumerator) external onlyOwner {
        _setDefaultRoyalty(receiver, feeNumerator);
    }

    function contractURI() external view returns (string memory) {
        return string.concat(_baseTokenURI, "collection");
    }

    function totalMinted() external view returns (uint256) {
        return nextTokenId - 1;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC721, ERC2981, IERC165) returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
}

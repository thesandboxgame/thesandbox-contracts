pragma solidity ^0.5.2;

interface MintingFeeCollector {
    function multiple_minted(uint256[] calldata tokenIds, uint256 feePerToken) external;
    function single_minted(uint256 tokenId, uint256 fee) external;
}
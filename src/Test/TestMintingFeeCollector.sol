pragma solidity ^0.5.2;

import "../Asset/Interfaces/MintingFeeCollector.sol";

import "../Asset.sol";
import "../../contracts_common/src/Interfaces/ERC20.sol";

contract TestMintingFeeCollector is MintingFeeCollector {
    
    mapping(uint256 => uint256) stakes;

    Asset from;
    address owner;
    constructor(address _owner, Asset _from) public {
        from = _from;
        owner = _owner;
    }

    function multiple_minted(uint256[] calldata tokenIds, uint256 feePerToken) external {
        require(msg.sender == address(from), "only accepting from");
        for(uint256 i = 0; i < tokenIds.length; i ++) {
            stakes[tokenIds[i]] = feePerToken;
        }
    }

    function single_minted(uint256 tokenId, uint256 fee) external {
        require(msg.sender == address(from), "only accepting from");
        stakes[tokenId] = fee;
    }

    function setFeeCollection(address newCollector, ERC20 newFeeToken, uint256 newFee) external {
        require(msg.sender == owner);
        from.setFeeCollection(newCollector, newFeeToken, newFee);
    }

}

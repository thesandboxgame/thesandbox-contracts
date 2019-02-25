pragma solidity ^0.5.2;

import "../Interfaces/ERC1271.sol";
import "../Interfaces/ERC1271Constants.sol";
import "../Libraries/SigUtil.sol";

contract ERC1271Wallet is ERC1271, ERC1271Constants{

    address owner;
    mapping(address => bool) authorizedSigners;

    constructor(address _signer) public {
        owner = msg.sender;
        authorizedSigners[_signer] = true;
    }

    function isValidSignature(
        bytes memory _data, 
        bytes memory _signature
    ) public view returns (bytes4 magicValue){
        bytes32 hash;
        assembly {
            hash := mload(add(_data, 32))
        }
        address signer = SigUtil.recover(hash, _signature);
        if(authorizedSigners[signer]) {
            return ERC1271_MAGICVALUE;
        }
    }
}
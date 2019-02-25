pragma solidity ^0.5.2;

import { ProxyImplementation } from "../../Libraries/ProxyImplementation.sol";

contract Sand712 is ProxyImplementation {
    bytes32 constant EIP712DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 DOMAIN_SEPARATOR;

    function init712(uint256 _chainId) public phase('712') {
        DOMAIN_SEPARATOR = keccak256(abi.encode(EIP712DOMAIN_TYPEHASH, keccak256("The Sandbox 3D"), keccak256("1"), _chainId, address(this)));
    }
    
    function domainSeparator() internal view returns(bytes32){
        return DOMAIN_SEPARATOR;
    }
}
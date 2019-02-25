pragma solidity ^0.5.2;

library BytesUtil {
    function memcpy(uint dest, uint src, uint len) internal pure {
        // Copy word-length chunks while possible
        for(; len >= 32; len -= 32) {
            assembly {
                mstore(dest, mload(src))
            }
            dest += 32;
            src += 32;
        }

        // Copy remaining bytes
        uint mask = 256 ** (32 - len) - 1;
        assembly {
            let srcpart := and(mload(src), not(mask))
            let destpart := and(mload(dest), mask)
            mstore(dest, or(destpart, srcpart))
        }
    }

    function toBytes(uint256 src, uint256 len) internal pure returns (bytes memory) {
        bytes memory ret = new bytes(len);
        uint retptr;
        assembly { retptr := add(ret, 32) }

        memcpy(retptr, src, len);
        return ret;
    }

    function toBytes(address a) internal pure returns (bytes memory b){
        assembly {
            let m := mload(0x40)
            mstore(add(m, 20), xor(0x140000000000000000000000000000000000000000, a))
            mstore(0x40, add(m, 52))
            b := m
        }
    }

    function toBytes(uint256 a) internal pure returns (bytes memory b){
        assembly {
            let m := mload(0x40)
            mstore(add(m, 32), a)
            mstore(0x40, add(m, 64))
            b := m
        }
    }

    function doFirstParamEqualsAddress(bytes memory data, address _address) internal pure returns (bool){
        if(data.length < (36 + 32)) {
            return false;
        }
        uint256 value;
        assembly {
            value := mload(add(data, 36))
        }
        return value == uint256(_address);
    }

    function overrideFirst32BytesWithAddress(bytes memory data, address _address) internal pure returns (bytes memory){
        uint dest;
        assembly {dest := add(data, 48)} // 48 = 32 (offset) + 4 (func sig) + 12 (address is only 20 bytes)

        bytes memory addressBytes = BytesUtil.toBytes(_address);
        uint src;
        assembly { src := add(addressBytes, 32) }
    
        memcpy(dest, src, 20);
        return data;
    }

    function overrideFirstTwo32BytesWithAddressAndInt(bytes memory data, address _address, uint256 _value) internal pure returns (bytes memory){
        uint dest;
        uint src;
        
        assembly {dest := add(data, 48)} // 48 = 32 (offset) + 4 (func sig) + 12 (address is only 20 bytes)
        bytes memory bbytes = BytesUtil.toBytes(_address);
        assembly { src := add(bbytes, 32) }
        memcpy(dest, src, 20);

        assembly {dest := add(data, 68)} // 48 = 32 (offset) + 4 (func sig) + 32 (next slot)
        bbytes = BytesUtil.toBytes(_value);
        assembly { src := add(bbytes, 32) }
        memcpy(dest, src, 32);

        return data;
    }
}

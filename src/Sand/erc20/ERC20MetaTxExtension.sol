pragma solidity ^0.5.2;

import "../../Libraries/BytesUtil.sol";
import "../../Libraries/SigUtil.sol";
import "../../Libraries/SafeMath.sol";
import "../../Interfaces/ERC1271.sol";
import "../../Interfaces/ERC1271Constants.sol";

contract ERC20MetaTxExtension is ERC1271Constants{
    using SafeMath for uint256;

    bytes32 constant ERC20METATRANSACTION_TYPEHASH = keccak256("ERC20MetaTransaction(address from,address to,uint256 amount,bytes data,uint256 nonce,uint256 gasPrice,uint256 gasLimit,uint256 tokenGasPrice,address relayer)");
    mapping(address => uint256) nonces;

    uint256 constant anteriorGasCost = 100000; // TODO calculate accurately
    uint256 constant maxUlteriorGasCost = 50000;  // TODO calculate accurately the worst case

    event MetaTx(bool success, bytes returnData);

    function ensureParametersValidity(
        address _from,
        uint256 _amount,
        uint256[4] memory params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        uint256 initialGas
    ) internal view {
        require(_relayer == address(0) || _relayer == msg.sender, "wrong relayer");
        require(initialGas > params[2] + maxUlteriorGasCost, "not enought gas given"); // need to give at least as much gas as requested by signer + extra to perform the call
        require(nonces[_from]+1 == params[0], "nonce out of order");
        require(balanceOf(_from) >= _amount.add(params[2].add(anteriorGasCost).add(maxUlteriorGasCost).mul(params[3])), "_from not enough balance");
        require(tx.gasprice == params[1], "gasPrice != signer gasPrice"); // need to provide same gasPrice as requested by signer
    }

    function ensureCorrectSigner(
        address _from,
        address _to,  
        uint256 _amount,
        bytes memory _data,
        uint256[4] memory params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes memory _sig,
        bytes32 typeHash,
        bool signedOnBehalf
    ) internal view {
        bytes32 hash = keccak256(abi.encodePacked(
            "\x19\x01",
            domainSeparator(),
            keccak256(abi.encode(
                typeHash,
                _from,
                _to,
                _amount,
                keccak256(_data),
                params[0],
                params[1],
                params[2],
                params[3],
                _relayer
            ))
        ));
        if(signedOnBehalf) {
            require(ERC1271(_from).isValidSignature(abi.encodePacked(hash), _sig) == ERC1271_MAGICVALUE, "invalid signature");
        } else {
            address signer = SigUtil.recover(hash, _sig);
            require(signer == _from, "signer != _from");
        }
    }

    function ensureCorrectSignerViaBasicSignature(
        address _from,
        address _to,  
        uint256 _amount,
        bytes memory _data,
        uint256[4] memory params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes memory _sig,
        bytes32 typeHash,
        bool signedOnBehalf
    ) internal view {
        bytes32 hash = SigUtil.prefixed(keccak256(abi.encodePacked(
            address(this),
            typeHash, 
             _from,
            _to,
            _amount,
            keccak256(_data),
            params[0],
            params[1],
            params[2],
            params[3],
            _relayer
        )));
        if(signedOnBehalf) {
            require(ERC1271(_from).isValidSignature(abi.encodePacked(hash), _sig) == ERC1271_MAGICVALUE, "invalid signature");
        } else {
            address signer = SigUtil.recover(hash, _sig);
            require(signer == _from, "signer != _from");
        }
    }

    function executeERC20MetaTx(
        address _from,
        address _to,  
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice, _amount
        address _relayer,
        bytes calldata _sig,
        address _tokenReceiver,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        uint256 initialGas = gasleft();
        ensureParametersValidity(_from, _amount, params, _relayer, initialGas);
        ensureCorrectSigner(_from, _to, _amount, _data, params, _relayer, _sig, ERC20METATRANSACTION_TYPEHASH, signedOnBehalf);
        return performERC20MetaTx(_from, _to, _amount, _data, params, initialGas, _tokenReceiver);
    }

    function executeERC20MetaTxViaBasicSignature(
        address _from,
        address _to,  
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice, _amount
        address _relayer,
        bytes calldata _sig,
        address _tokenReceiver,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        uint256 initialGas = gasleft();
        ensureParametersValidity(_from, _amount, params, _relayer, initialGas);
        ensureCorrectSignerViaBasicSignature(_from, _to, _amount, _data, params, _relayer, _sig, ERC20METATRANSACTION_TYPEHASH, signedOnBehalf);
        return performERC20MetaTx(_from, _to, _amount, _data, params, initialGas, _tokenReceiver);
    }

    function performERC20MetaTx(
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _data,
        uint256[4] memory params,
        uint256 initialGas,
        address _tokenReceiver
    ) internal returns(bool, bytes memory) {
        nonces[_from] = params[0];

        bool success;
        bytes memory returnData;
        if(_data.length == 0){
            _transfer(_from, _to, _amount);  // _gasLimit can be zero when no data is provided
            success = true;
        } else {
            (success, returnData) = callERC20MetaTx(_from, _to, _amount, _data, params[2]);        
        }

        emit MetaTx(success, returnData);
        
        _transfer(_from, _tokenReceiver, ((initialGas + anteriorGasCost) - gasleft()) * params[3]);
        return (success, returnData);
    }

    function callERC20MetaTx(address _from, address _to, uint256 _amountApproved, bytes memory _data, uint256 _gasLimit) internal returns (bool, bytes memory) {
        require(BytesUtil.doFirstParamEqualsAddress(_data, _from), "first param != _from");

        uint256 prevAllowance = allowance(_from, _to);
        if(_amountApproved > 0 && prevAllowance != (2**256)-1) { // assume https://github.com/ethereum/EIPs/issues/717
            _approveForWithoutEvent(_from, _to, _amountApproved);
        }
        (bool success, bytes memory returnData) = _to.call.gas(_gasLimit)(_data);        
        if(_amountApproved > 0 && prevAllowance != (2**256)-1){
            _approveForWithoutEvent(_from, _to, prevAllowance);
        }
        return (success, returnData);
    }


    function meta_nonce(address _from) external view returns (uint256 nonce) {
        return nonces[_from];
    }

    function allowance(address _owner, address _spender) public view returns (uint256 remaining);
    function domainSeparator() internal view returns(bytes32);
    function balanceOf(address who) public view returns (uint256);
    function _approveForWithoutEvent(address _owner, address _target, uint256 _amount) internal;
    function _transfer(address _from, address _to, uint256 _amount) internal;
}

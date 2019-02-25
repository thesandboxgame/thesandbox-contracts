pragma solidity ^0.5.2;

import "../../Libraries/BytesUtil.sol";
import "../../Libraries/SigUtil.sol";
import "../../Libraries/SafeMath.sol";
import "../erc20/ERC20MetaTxExtension.sol";

contract ERC777MetaTxExtension is ERC20MetaTxExtension {


    bytes32 constant ERC777METATRANSACTION_TYPEHASH = keccak256("ERC777MetaTransaction(address from,address to,uint256 amount,bytes data,uint256 nonce,uint256 gasPrice,uint256 gasLimit,uint256 tokenGasPrice,address relayer)");

    // TODO could potentialy get ir fo this and use operatorSend instead (the token contract itself could be an defaultOperator)
    function sendFrom(address _from, address _to, uint256 _amount, bytes calldata _data) external {
        require(msg.sender == address(this) || msg.sender == _from, "only to be used by contract to support meta-tx"); // allow _from to allow gas estimatiom
        _send(_from, _from, _to, _amount, _data, "", true);
    }

    function executeERC777MetaTx(
        address _from,
        address _to, 
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes calldata _sig,
        address _tokenReceiver,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        uint256 initialGas = gasleft();
        ensureParametersValidity(_from, _amount, params, _relayer, initialGas);
        ensureCorrectSigner(_from, _to, _amount, _data, params, _relayer, _sig, ERC777METATRANSACTION_TYPEHASH, signedOnBehalf);
        return performERC777MetaTx(_from, _to, _amount, _data, params, initialGas, _tokenReceiver);
    }

    function executeERC777MetaTxViaBasicSignature(
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
        ensureCorrectSignerViaBasicSignature(_from, _to, _amount, _data, params, _relayer, _sig, ERC777METATRANSACTION_TYPEHASH, signedOnBehalf);
        return performERC777MetaTx(_from, _to, _amount, _data, params, initialGas, _tokenReceiver);
    }

    function performERC777MetaTx(
        address _from,
        address _to,
        uint256 _amount, 
        bytes memory _data,
        uint256[4] memory params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice, _amount
        uint256 initialGas,
        address _tokenReceiver
    ) internal returns (bool, bytes memory) {
        nonces[_from] = params[0];

        (bool success, bytes memory returnData) = address(this).call.gas(params[2])(abi.encodeWithSignature("sendFrom(address,address,uint256,bytes)", _from, _to, _amount, _data));

        emit MetaTx(success, returnData);
        
        _transfer(_from, _tokenReceiver, ((initialGas + anteriorGasCost) - gasleft()) * params[3]);
        return (success, returnData);
    }

    function _send(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _data,
        bytes memory _operatorData,
        bool _preventLocking
    )internal;
}

pragma solidity ^0.5.2;

import "../../../contracts_common/src/Libraries/BytesUtil.sol";
import "../../../contracts_common/src/Libraries/SigUtil.sol";
import "../../../contracts_common/src/Libraries/SafeMath.sol";
import "../erc20/ERC20MetaTxExtension.sol";

// TODO WORK IN PROGRESS
contract ERC777MetaTxExtension is ERC20MetaTxExtension {


    bytes32 constant ERC777METATRANSACTION_TYPEHASH = keccak256("ERC777MetaTransaction(address from,address to,uint256 amount,bytes data,uint256 nonce,uint256 gasPrice,uint256 gasLimit,uint256 tokenGasPrice,address relayer)");

    // TODO could potentialy get ir fo this and use operatorSend instead (the token contract itself could be an defaultOperator)
    function sendFrom(address _from, address _to, uint256 _amount, bytes calldata _data) external {
        require(msg.sender == address(this), "only to be used by contract to support meta-tx"); // allow _from to allow gas estimatiom
        _send(_from, _from, _to, _amount, _data, "", true);
    }

    function executeERC777MetaTx(
        address _from,
        address _to, 
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _txGas, _tokenGasPrice
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
        uint256[4] calldata params, // _nonce, _gasPrice, _txGas, _tokenGasPrice
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
        uint256[4] memory params, // _nonce, _gasPrice, _txGas, _tokenGasPrice
        uint256 initialGas,
        address _tokenReceiver
    ) internal returns (bool, bytes memory) {
        nonces[_from] = params[0]; // TODO  extract to not dupplicate ERC20MetaTxExtension code

        bool success;
        bytes memory returnData;
        if(_data.length == 0){
            _transfer(_from, _to, _amount);
            success = true;
        } else {
            // should we support non-erc777 execution ?
            (success, returnData) = address(this).call.gas(params[2])(abi.encodeWithSignature("sendFrom(address,address,uint256,bytes)", _from, _to, _amount, _data));
            require(gasleft() >= params[2].div(63), "not enough gas left");
        }

        // TODO  extract to not dupplicate ERC20MetaTxExtension code
        emit MetaTx(_from, params[0], success, returnData);
        
        if(params[3] > 0) {
            uint256 gasConsumed = (initialGas + MIN_GAS) - gasleft();
            if(gasConsumed > GAS_LIMIT_OFFSET + params[2]) {
                gasConsumed = GAS_LIMIT_OFFSET + params[2]; 
                // idealy we would like to charge only max(BASE_GAS, gas consumed outside the inner call) + gas consumed as part of the inner call
            }
            _transfer(_from, _tokenReceiver, gasConsumed * params[3]);
        }
        
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

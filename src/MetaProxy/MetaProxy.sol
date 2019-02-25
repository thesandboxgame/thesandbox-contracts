pragma solidity ^0.5.2;

import "../Sand/Sand20.sol";
import "../Sand/Sand777.sol";

contract MetaProxy {

    address payable owner;
    address payable executor;
    address sandContract;
    uint256 recharge; 

    uint256 alertThreshold;

    event RechargeAlert(uint256 balance);

    constructor(address payable _owner, address _sandContract, address payable _executor, uint256 _recharge, uint256 _alertThreshold) public {
        owner = _owner;
        sandContract = _sandContract;
        executor = _executor;
        recharge = _recharge;
        alertThreshold = _alertThreshold;
    }

    function processRecharge(address payable _executor) internal {
        require(_executor == executor, "only executor is able to execute");
        if(_executor.balance < recharge) {
            if(recharge - _executor.balance < address(this).balance) {
                _executor.transfer(recharge - _executor.balance);
            } else {
                _executor.transfer(address(this).balance);
            }
            if(address(this).balance <= alertThreshold) {
                emit RechargeAlert(address(this).balance);
            }
        }
    }

    function executeERC20MetaTx(
        address _from,
        address _to, 
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes calldata _sig,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        processRecharge(tx.origin);
        return Sand20(sandContract).executeERC20MetaTx(_from, _to, _amount, _data, params, _relayer, _sig, address(this), signedOnBehalf);
    }

    function executeERC20MetaTxViaBasicSignature(
        address _from,
        address _to, 
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes calldata _sig,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        processRecharge(tx.origin);
        return Sand20(sandContract).executeERC20MetaTxViaBasicSignature(_from, _to, _amount, _data, params, _relayer, _sig, address(this), signedOnBehalf);
    }

    function executeERC777MetaTx(
        address _from,
        address _to, 
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes calldata _sig,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        processRecharge(tx.origin);
        return Sand777(sandContract).executeERC777MetaTx(_from, _to, _amount, _data, params, _relayer, _sig, address(this), signedOnBehalf);
    }

    function executeERC777MetaTxViaBasicSignature(
        address _from,
        address _to, 
        uint256 _amount,
        bytes calldata _data,
        uint256[4] calldata params, // _nonce, _gasPrice, _gasLimit, _tokenGasPrice
        address _relayer,
        bytes calldata _sig,
        bool signedOnBehalf
    ) external returns (bool, bytes memory) {
        processRecharge(tx.origin);
        return Sand777(sandContract).executeERC777MetaTxViaBasicSignature(_from, _to, _amount, _data, params, _relayer, _sig, address(this), signedOnBehalf);
    }

    function() external payable {}

    function changeAlertThreshold(uint256 _newAlertThreshold) external {
        require(msg.sender == owner, "only owner able to change the alert threshold");
        alertThreshold = _newAlertThreshold;
    }
    function changeRecharge(uint256 _newRecharge) external {
        require(msg.sender == owner, "only owner able to change recharge");
        recharge = _newRecharge;
    }
    function changeOwner(address payable _newOwner) external {
        require(msg.sender == owner, "only owner able to change owner");
        owner = _newOwner;
    }
    function changeExecutor(address payable _newExecutor) external {
        require(msg.sender == owner, "only owner able to change executor");
        executor = _newExecutor;
    }
    function withdrawETH() external {
        require(msg.sender == owner, "only owner able to withdraw ETH");
        owner.transfer(address(this).balance);
    }
    function withdrawETH(uint256 keep) external {
        require(msg.sender == owner, "only owner able to withdraw ETH");
        if(keep < address(this).balance) {
            owner.transfer(address(this).balance - keep);
        }
    }
    function withdrawSand(uint256 keep) public {
        require(msg.sender == owner, "only owner able to withdrawn Sand");
        uint256 currentBalance = Sand20(sandContract).balanceOf(address(this));
        if(keep < currentBalance) {
            Sand20(sandContract).transfer(owner, currentBalance - keep);
        }
    }
    function withdrawSand() external {
        withdrawSand(1); // keep 1 Sand to keep the execute gas cost to not increase by having balance increase from zero
    }
}

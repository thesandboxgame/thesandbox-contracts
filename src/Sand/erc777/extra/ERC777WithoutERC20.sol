pragma solidity 0.5.2;

import { ERC777BaseToken } from "../ERC777BaseToken.sol";

import { Ownable } from "../../../../contracts_common/src/BaseWithStorage/Ownable.sol";

contract ERC777WitoutERC20 is ERC777BaseToken, Ownable {

    constructor() public {
        init777WithoutERC20();
    }
    function init777WithoutERC20() public phase('777WithoutERC20') {
        setInterfaceImplementation("ERC20Token", address(0));
    }

    /// overrite ERC20BaseToken ERC20 methods to revert
    function decimals() public view returns (uint8) { revert(); }
    function transfer(address, uint256) public returns (bool) { revert(); }
    function transferFrom(address, address, uint256) public returns (bool) { revert(); }
    function approve(address, uint256) public returns (bool) { revert(); }
    function allowance(address, address) public view returns (uint256) { revert(); }

    //override to block from emitting Transfer when not mErc20compatible
    function _send(
        address _operator,
        address _from,
        address _to,
        uint256 _amount,
        bytes memory _data,
        bytes memory _operatorData,
        bool _preventLocking
    )
        internal
    {
        callSender(_operator, _from, _to, _amount, _data, _operatorData);

        require(_to != address(0), "Cannot send to 0x0");
        require(mBalances[_from] >= _amount, "Not enough funds");

        mBalances[_from] = mBalances[_from] -= _amount;
        mBalances[_to] = mBalances[_to] += _amount;

        callRecipient(_operator, _from, _to, _amount, _data, _operatorData, _preventLocking);

        emit Sent(_operator, _from, _to, _amount, _data, _operatorData);
    }
}

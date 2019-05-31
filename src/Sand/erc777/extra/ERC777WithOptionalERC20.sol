pragma solidity ^0.5.2;

import { ERC777BaseToken } from "../ERC777BaseToken.sol";

import { Ownable } from "../../../../contracts_common/src/BaseWithStorage/Ownable.sol";

contract ERC777WithOptionalERC20 is ERC777BaseToken, Ownable {

    bool internal mErc20compatible;
    
    event ERC20Disabled();

    constructor() public {
        initOptionalERC20();
    }
    function initOptionalERC20() public phase('OptionalERC20') {
        init777();
        mErc20compatible = true;
    }

    /// @notice This modifier is applied to erc20 obsolete methods that are
    ///  implemented only to maintain backwards compatibility. When the erc20
    ///  compatibility is disabled, this methods will fail.
    modifier erc20 () {
        require(mErc20compatible, "ERC20 is disabled");
        _;
    }

     /// @notice Disables the ERC20 interface. This function can only be called
    ///  by the owner.
    function disableERC20() public onlyOwner {
        mErc20compatible = false;
        setInterfaceImplementation("ERC20Token", address(0));
        emit ERC20Disabled();
    }

    function decimals() public erc20 view returns (uint8) { return super.decimals(); }
    function transfer(address _to, uint256 _amount) public erc20 returns (bool success) { return super.transfer(_to, _amount); }
    function transferFrom(address _from, address _to, uint256 _amount) public erc20 returns (bool success) { return super.transferFrom(_from, _to, _amount); }
    function approve(address _spender, uint256 _amount) public erc20 returns (bool success) { return super.approve(_spender, _amount); }
    function allowance(address _owner, address _spender) public erc20 view returns (uint256 remaining) { return super.allowance(_owner, _spender); }

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

        // _transfer ///////////////////////////////////////////////////////////////
        require(_to != address(0), "Cannot send to 0x0");
        require(mBalances[_from] >= _amount, "Not enough funds");

        mBalances[_from] = mBalances[_from] -= _amount;
        mBalances[_to] = mBalances[_to] += _amount;

        if (mErc20compatible) { emit Transfer(_from, _to, _amount); }
        // ////////////////////////////////////////////////////////////////////////

        callRecipient(_operator, _from, _to, _amount, _data, _operatorData, _preventLocking);

        emit Sent(_operator, _from, _to, _amount, _data, _operatorData);
    }
}

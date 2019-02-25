pragma solidity ^0.5.2;

import { ERC20 } from "../../Interfaces/ERC20.sol";
import { ERC20Events } from "../../Interfaces/ERC20Events.sol";

contract ERC20BaseToken is ERC20Events /*is ERC20*/ {
    
    uint256 internal mTotalSupply;
    mapping(address => uint256) internal mBalances;
    mapping(address => mapping(address => uint256)) internal mAllowed;

    function totalSupply() public view returns (uint256) {
        return mTotalSupply;
    }

    function balanceOf(address who) public view returns (uint256) {
        return mBalances[who];
    }

    function decimals() public view returns (uint8) { return uint8(18); }

    function transfer(address _to, uint256 _amount) public returns (bool success) {
        _transfer(msg.sender, _to, _amount);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _amount) public returns (bool success) {
        require(mAllowed[_from][msg.sender] >= _amount, "Not enough funds allowed");

        if(mAllowed[_from][msg.sender] != (2**256)-1) { // save gas when allowance is maximal by not reducing it (see https://github.com/ethereum/EIPs/issues/717)
          mAllowed[_from][msg.sender] = mAllowed[_from][msg.sender] -= _amount;
        }
        _transfer(_from, _to, _amount);
        return true;
    }

    function approve(address _spender, uint256 _amount) public returns (bool success) {
        _approveFor(msg.sender, _spender, _amount);
        return true;
    }

    function _approveFor(address _owner, address _spender, uint256 _amount) internal {
        mAllowed[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function _approveForWithoutEvent(address _owner, address _spender, uint256 _amount) internal {
        mAllowed[_owner][_spender] = _amount;
    }

    function allowance(address _owner, address _spender) public view returns (uint256 remaining) {
        return mAllowed[_owner][_spender];
    }

    function _transfer(address _from, address _to, uint256 _amount) internal {
        _transferBalance(_from, _to, _amount);
        _emitTransferEvent(_from, _to, _amount);
    }

    function _transferBalance(address _from, address _to, uint256 _amount) internal {
        require(_to != address(0), "Cannot send to 0x0");
        require(mBalances[_from] >= _amount, "Not enough funds");
        mBalances[_from] = mBalances[_from] -= _amount;
        mBalances[_to] = mBalances[_to] += _amount;
    }

    function _emitTransferEvent(address _from, address _to, uint256 _amount) internal {
        emit Transfer(_from, _to, _amount);
    }

    // extra functionalities //////////////////////////////////////////////////////////////////////////////

    function _mint(address _to, uint256 _amount) internal {
        require(mTotalSupply == 0, "cann't mint more");
        mTotalSupply = mTotalSupply += _amount;
        mBalances[_to] = mBalances[_to] += _amount;
        emit Transfer(address(0), _to, _amount);
    }

    function _burn(address _from, uint256 _amount) internal {
        if(msg.sender != _from) {
            require(mAllowed[_from][msg.sender] >= _amount, "Not enough funds allowed");
            if(mAllowed[_from][msg.sender] != (2**256)-1) { // save gas when allowance is maximal by not reducing it (see https://github.com/ethereum/EIPs/issues/717)
                mAllowed[_from][msg.sender] = mAllowed[_from][msg.sender] -= _amount;
            }
        }
        
        require(mBalances[_from] >= _amount, "Not enough funds");
        mBalances[_from] = mBalances[_from] -= _amount;
        mTotalSupply = mTotalSupply -= _amount;
        emit Transfer(_from, address(0), _amount);
    }
}

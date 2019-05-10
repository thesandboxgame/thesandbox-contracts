pragma solidity 0.5.2;

import { ERC20 } from "../../../contracts_common/src/Interfaces/ERC20.sol";
import { ERC20Events } from "../../../contracts_common/src/Interfaces/ERC20Events.sol";
import "../../../contracts_common/src/Libraries/SafeMath.sol";

contract ERC20BaseToken is ERC20Events /*is ERC20*/ {
    using SafeMath for uint256;
    
    ////////////////// Super Operators ///////////////////////////////////////////////////////
    // Allowing extension without redeploy
    mapping(address => bool) internal mSuperOperators;
    address public admin;
    event AdminChanged(address oldAdmin, address newAdmin);
    function changeAdmin(address _admin) external {
        require(msg.sender == admin, "only admin can change admin");
        emit AdminChanged(admin, _admin);
        admin = _admin;
    }
    event SuperOperator(address superOperator, bool enabled);
    function setSuperOperator(address _superOperator, bool _enabled) external {
        require(msg.sender == admin, "only admin is allowed to add super operators");
        mSuperOperators[_superOperator] = _enabled; 
        emit SuperOperator(_superOperator, _enabled);
    }
    function isSuperOperator(address who) public view returns(bool) {
        return mSuperOperators[who];
    }
    /////////////////////////////////////////////////////////////////////////////////////////////


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
        if(msg.sender != _from && !mSuperOperators[msg.sender]) {
            uint256 allowance = mAllowed[_from][msg.sender];
            if(allowance != (2**256)-1) { // save gas when allowance is maximal by not reducing it (see https://github.com/ethereum/EIPs/issues/717)
                require(allowance >= _amount, "Not enough funds allowed");
                mAllowed[_from][msg.sender] = allowance.sub(_amount);
            }
        }
        _transfer(_from, _to, _amount);
        return true;
    }

    function approve(address _spender, uint256 _amount) public returns (bool success) {
        _approveFor(msg.sender, _spender, _amount);
        return true;
    }

    function approveFor(address from, address _spender, uint256 _amount) public returns (bool success) {
        require(msg.sender == from || mSuperOperators[msg.sender], "msg.sender != from || superOperator");
        _approveFor(from, _spender, _amount);
        return true;
    }

    function _approveFor(address _owner, address _spender, uint256 _amount) internal {
        require(_owner != address(0) && _spender != address(0), "Cannot approve with 0x0");
        mAllowed[_owner][_spender] = _amount;
        emit Approval(_owner, _spender, _amount);
    }

    function _approveForWithoutEvent(address _owner, address _spender, uint256 _amount) internal {
        require(_owner != address(0) && _spender != address(0), "Cannot approve with 0x0");
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
        mBalances[_from] = mBalances[_from].sub(_amount);
        mBalances[_to] = mBalances[_to].add(_amount);
    }

    function _emitTransferEvent(address _from, address _to, uint256 _amount) internal {
        emit Transfer(_from, _to, _amount);
    }

    // extra functionalities //////////////////////////////////////////////////////////////////////////////

    function _mint(address _to, uint256 _amount) internal {
        require(_to != address(0), "Cannot mint to 0x0");
        mTotalSupply = mTotalSupply.add(_amount);
        mBalances[_to] = mBalances[_to].add(_amount);
        emit Transfer(address(0), _to, _amount);
    }

    function _burn(address _from, uint256 _amount) internal {
        if(msg.sender != _from && !mSuperOperators[msg.sender]) {
            require(mAllowed[_from][msg.sender] >= _amount, "Not enough funds allowed");
            if(mAllowed[_from][msg.sender] != (2**256)-1) { // save gas when allowance is maximal by not reducing it (see https://github.com/ethereum/EIPs/issues/717)
                mAllowed[_from][msg.sender] = mAllowed[_from][msg.sender].sub(_amount);
            }
        }
        
        require(mBalances[_from] >= _amount, "Not enough funds");
        mBalances[_from] = mBalances[_from].sub(_amount);
        mTotalSupply = mTotalSupply.sub(_amount);
        emit Transfer(_from, address(0), _amount);
    }
}

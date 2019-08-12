pragma solidity ^0.5.2;

import "./Admin.sol";

contract SuperOperators is Admin {
    mapping(address => bool) internal mSuperOperators;
    event SuperOperator(address superOperator, bool enabled);
    function setSuperOperator(address _superOperator, bool _enabled) external {
        require(
            msg.sender == admin,
            "only admin is allowed to add super operators"
        );
        mSuperOperators[_superOperator] = _enabled;
        emit SuperOperator(_superOperator, _enabled);
    }
    function isSuperOperator(address who) public view returns (bool) {
        return mSuperOperators[who];
    }
}

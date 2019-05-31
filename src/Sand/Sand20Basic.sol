pragma solidity ^0.5.2;

import "./erc777/ERC20BaseTokenWithERC777Events.sol";
import { ProxyImplementation } from "../../contracts_common/src/BaseWithStorage/ProxyImplementation.sol";

contract Sand20Basic is ProxyImplementation, ERC20BaseTokenWithERC777Events {

    constructor(address _admin, address _beneficiary) public {
        initSand(_admin, _beneficiary);
    }
    function initSand(address _admin, address _beneficiary) public phase('SAND_20') {
        admin = _admin;
        if(mTotalSupply == 0 ) {
            _mint(_beneficiary, 3000000000000000000000000000);
        }
    }

    function name() public pure returns (string memory) { return "SAND"; }
    function symbol() public pure returns (string memory) { return "SND"; }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}

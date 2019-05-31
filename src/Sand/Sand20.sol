pragma solidity ^0.5.2;

import "./erc20/ERC20ApproveExtension.sol";
import "./erc20/ERC20MetaTxExtension.sol";
import "./erc777/ERC20BaseTokenWithERC777Events.sol";
import "../TheSandbox712.sol";
import { ProxyImplementation } from "../../contracts_common/src/BaseWithStorage/ProxyImplementation.sol";

contract Sand20 is ProxyImplementation, ERC20MetaTxExtension, ERC20ApproveExtension, TheSandbox712, ERC20BaseTokenWithERC777Events {

    constructor(address _admin, address _beneficiary) public {
        initSand(_admin, _beneficiary);
    }
    function initSand(address _admin, address _beneficiary) public phase('SAND_20') {
        init712();
        admin = _admin;
        if(mTotalSupply == 0 ) {
            _mint(_beneficiary, 3000000000000000000000000000);
        }
    }

    function name() public view returns (string memory) { return "SAND"; }
    function symbol() public view returns (string memory) { return "SAND"; }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}

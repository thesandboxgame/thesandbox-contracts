pragma solidity ^0.5.2;

import "./erc20/ERC20ApproveExtension.sol";
import "./erc20/ERC20MetaTxExtension.sol";
import "./erc777/ERC20BaseTokenWithERC777Events.sol";
import "../TheSandbox712.sol";
import { ProxyImplementation } from "../Libraries/ProxyImplementation.sol";

contract Sand20 is ProxyImplementation, ERC20ApproveExtension, ERC20MetaTxExtension, TheSandbox712, ERC20BaseTokenWithERC777Events {

    constructor(address _beneficiary, uint256 _chainId) public {
        initSand(_beneficiary, _chainId);
    }
    function initSand(address _beneficiary, uint256 _chainId) public phase('SAND_20') {
        init712(_chainId);
        if(mTotalSupply == 0 ) { _mint(_beneficiary, 3000000000000000000000000000); }
    }

    function name() public pure returns (string memory) { return "SAND"; }
    function symbol() public pure returns (string memory) { return "SND"; }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}

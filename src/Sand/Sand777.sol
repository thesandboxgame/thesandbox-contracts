pragma solidity ^0.5.2;

import "./erc20/ERC20ApproveExtension.sol";
import "./erc777/ERC777BaseToken.sol";
import "./Sand712.sol";
import { ProxyImplementation } from "../Libraries/ProxyImplementation.sol";
import "./erc20/ERC20MetaTxExtension.sol";
import "./erc777/ERC777MetaTxExtension.sol";

contract Sand777 is ProxyImplementation, ERC20ApproveExtension, ERC777MetaTxExtension, Sand712, ERC777BaseToken {

    constructor(address _beneficiary, uint256 _chainId) public {
        initSand(_beneficiary, _chainId);
    }
    // TODO need to be updated if updating inheritance  // better pattern ?
    function initSand(address _beneficiary, uint256 _chainId) public phase('SAND_777') {
        init712(_chainId);
        init777(); 
        if(mTotalSupply == 0 ) { _mint(_beneficiary, 3000000000000000000000000000); }
    }

    function name() public pure returns (string memory) { return "SAND"; }
    function symbol() public pure returns (string memory) { return "SND"; }

    function burn(uint256 _amount) external {
        _burn(msg.sender, _amount);
    }
}

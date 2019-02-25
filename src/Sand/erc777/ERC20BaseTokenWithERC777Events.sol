pragma solidity ^0.5.2;

import { ERC777TokenEvents } from "../../Interfaces/ERC777TokenEvents.sol";
import { ERC20BaseToken } from "../erc20/ERC20BaseToken.sol";

/*
Allow ERC20 to be later upgraded to an ERC777

Since to be a valid ERC777 token, events of that standard need to be emitted for every balance transfer that ever happened 
we need to trigger them as part of ERC20
*/
contract ERC20BaseTokenWithERC777Events is ERC20BaseToken, ERC777TokenEvents {

    function _transfer(address _from, address _to, uint256 _amount) internal {
        super._transfer(_from, _to, _amount);
        emit Sent(msg.sender, _from, _to, _amount, '', '');
    }

    function _mint(address _to, uint256 _amount) internal {
        super._mint(_to, _amount);
        emit Minted(msg.sender, _to, _amount, '');
    }

    function _burn(address _from, uint256 _amount) internal {
        super._burn(_from, _amount);
        emit Burned(msg.sender, _from, _amount, '', '');
    }
}

pragma solidity ^0.5.2;

import "./Asset/ERC1155ERC721.sol";
import "./Asset/erc1155/ERC1155SignedAuctionExtension.sol";
import "./TheSandbox712.sol";
import "./Sand.sol";

contract Asset is ProxyImplementation, ERC1155SignedAuctionExtension, TheSandbox712, ERC1155ERC721 {

  constructor(Sand _sandContract, uint256 _chainId) public ERC1155ERC721(_sandContract) {
      initAsset(_sandContract, _chainId);
  }

  function initAsset(Sand _sandContract, uint256 _chainId) public phase('ASSET') {
      init712(_chainId);
      initERC1155ERC721(_sandContract);
  }
}

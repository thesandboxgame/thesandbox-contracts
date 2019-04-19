pragma solidity 0.5.2;

import "./Asset/ERC1155ERC721.sol";
import "./TheSandbox712.sol";
import "./Sand.sol";

contract Asset is ProxyImplementation, TheSandbox712, ERC1155ERC721 { // TODO remove TheSandbox712 unless we need to add Approval extension or other that require signed message

  constructor(Sand _sandContract, address _feeCollector, address _admin) public ERC1155ERC721(_sandContract, _feeCollector, _admin) {
      initAsset(_sandContract, _feeCollector, _admin);
  }

  function initAsset(Sand _sandContract, address _feeCollector, address _admin) public phase('ASSET') {
      init712();
      initERC1155ERC721(_sandContract, _feeCollector, _admin);
  }
}

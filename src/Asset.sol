pragma solidity ^0.5.2;

import "./Asset/ERC1155ERC721.sol";
import "./TheSandbox712.sol";

contract Asset is ProxyImplementation, TheSandbox712, ERC1155ERC721 { // TODO remove TheSandbox712 unless we need to add Approval extension or other that require signed message

  constructor(address _metaTransactionContract, address _feeCollector, address _admin) public ERC1155ERC721(_metaTransactionContract, _feeCollector, _admin) {
      initAsset(_metaTransactionContract, _feeCollector, _admin);
  }

  function initAsset(address _metaTransactionContract, address _feeCollector, address _admin) public phase('ASSET') {
      init712();
      initERC1155ERC721(_metaTransactionContract, _feeCollector, _admin);
  }
}

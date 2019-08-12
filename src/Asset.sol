pragma solidity 0.5.9;

import "./Asset/ERC1155ERC721.sol";

contract Asset is ERC1155ERC721 {
    constructor(
        address _metaTransactionContract,
        address _admin,
        address _bouncerAdmin
    ) public ERC1155ERC721(_metaTransactionContract, _admin, _bouncerAdmin) {}
}

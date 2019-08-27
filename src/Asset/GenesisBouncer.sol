pragma solidity 0.5.9;

import "./ERC1155ERC721.sol";
import "../../contracts_common/src/BaseWithStorage/Admin.sol";

contract GenesisBouncer is Admin {
    ERC1155ERC721 asset;
    mapping(address => bool) minters;

    constructor(ERC1155ERC721 _asset, address _admin, address _firstMinter)
        public
    {
        asset = _asset;
        admin = _admin;
        setMinter(_firstMinter, true);
    }

    event MinterUpdated(address minter, bool allowed);
    function setMinter(address _minter, bool allowed) public {
        require(msg.sender == admin, "only admin can allocate minter");
        minters[_minter] = allowed;
        emit MinterUpdated(_minter, allowed);
    }

    function mintFor(
        address _creator,
        uint48 _packId,
        bytes32 _hash,
        uint32 _supply,
        uint8 _rarity,
        address _owner
    ) public returns (uint256 tokenId) {
        require(minters[msg.sender], "not authorized");
        return
            asset.mint(_creator, _packId, _hash, _supply, _rarity, _owner, "");
    }

    function mintMultipleFor(
        address _creator,
        uint48 _packId,
        bytes32 _hash,
        uint256[] memory _supplies,
        bytes memory _rarityPack,
        address _owner
    ) public returns (uint256[] memory tokenIds) {
        require(minters[msg.sender], "not authorized");
        return
            asset.mintMultiple(
                _creator,
                _packId,
                _hash,
                _supplies,
                _rarityPack,
                _owner,
                ""
            );
    }
}

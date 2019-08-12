pragma solidity 0.5.9;

import "../../contracts_common/src/Interfaces/ERC1155.sol";
import "../../contracts_common/src/Interfaces/ERC1155TokenReceiver.sol";

import "../../contracts_common/src/Libraries/AddressUtils.sol";
import "../../contracts_common/src/Libraries/ObjectLib32.sol";
import "../../contracts_common/src/Libraries/SafeMath.sol";

import "../../contracts_common/src/Interfaces/ERC721.sol";
import "../../contracts_common/src/Interfaces/ERC721TokenReceiver.sol";

import "./Interfaces/AssetBouncer.sol";

import "../../contracts_common/src/BaseWithStorage/SuperOperators.sol";

contract ERC1155ERC721 is SuperOperators, ERC1155, ERC721 {
    // LIBRARIES /////////////////////////////////////////////////////////////////////////
    using AddressUtils for address;
    using ObjectLib32 for ObjectLib32.Operations;
    using ObjectLib32 for uint256;
    using SafeMath for uint256;
    ///////////////////////////////////////////////////////////////////////////////////////////////

    // CONSTANTS //////////////////////////////////////////////////////////////////////////////////
    bytes4 private constant ERC1155_IS_RECEIVER = 0x4e2312e0;
    bytes4 private constant ERC1155_RECEIVED = 0xf23a6e61;
    bytes4 private constant ERC1155_BATCH_RECEIVED = 0xbc197c81;
    bytes4 private constant ERC721_RECEIVED = 0x150b7a02;
    uint256 private constant IS_NFT = 0x0000000000000000000000000000000000000000800000000000000000000000;
    uint256 private constant NOT_IS_NFT = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF7FFFFFFFFFFFFFFFFFFFFFFF;
    uint256 private constant NFT_INDEX = 0x00000000000000000000000000000000000000007FFFFFFF8000000000000000;
    uint256 private constant NOT_NFT_INDEX = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF800000007FFFFFFFFFFFFFFF;
    uint256 private constant URI_ID = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF000000007FFFFFFFFFFF8000;
    uint256 private constant PACK_INDEX = 0x0000000000000000000000000000000000000000000000000000000000007FFF;
    ///////////////////////////////////////////////////////////////////////////////////////////////

    event CreatorshipTransfer(
        address indexed original,
        address indexed from,
        address indexed to
    );

    // STORAGE /////////////////////////////////////////////////////////////////////////////////////
    mapping(address => uint256) private numNFTPerAddress; // erc721
    mapping(uint256 => address) private owners; // erc721
    mapping(address => mapping(uint256 => uint256)) private packedTokenBalance; // erc1155
    mapping(address => mapping(address => bool)) private operatorsForAll; // erc721 and erc1155
    mapping(uint256 => address) private erc721_operators; // erc721
    mapping(uint256 => bytes32) private metadataHash; // erc721 and erc1155
    mapping(uint256 => bytes) private powerPack; // rarity configuration per packs (2 bits per Asset)
    mapping(uint256 => uint32) private nextCollectionIndex; // extraction

    mapping(address => address) private creatorship; // creatorship transfer

    mapping(address => bool) private bouncers; // the contract allowed to mint
    mapping(address => bool) private metaTransactionContracts; // native meta-transaction support
    ///////////////////////////////////////////////////////////////////////////////////////////////

    address public bouncerAdmin;

    constructor(
        address _metaTransactionContract,
        address _admin,
        address _bouncerAdmin
    ) public {
        metaTransactionContracts[_metaTransactionContract] = true;
        admin = _admin;
        bouncerAdmin = _bouncerAdmin;
        emit MetaTransactionProcessor(_metaTransactionContract, true);
    }

    event BouncerAdminChanged(address oldBouncerAdmin, address newBouncerAdmin);
    function changeBouncerAdmin(address _newBouncerAdmin) external {
        require(
            msg.sender == bouncerAdmin,
            "only bouncerAdmin can change itself"
        );
        emit BouncerAdminChanged(bouncerAdmin, _newBouncerAdmin);
        bouncerAdmin = _newBouncerAdmin;
    }

    event Bouncer(address bouncer, bool enabled);
    function setBouncer(address _bouncer, bool _enabled) external {
        require(
            msg.sender == bouncerAdmin,
            "only bouncerAdmin can setup bouncers"
        );
        bouncers[_bouncer] = _enabled;
        emit Bouncer(_bouncer, _enabled);
    }

    event MetaTransactionProcessor(address metaTransactionProcessor, bool enabled);
    function setMetaTransactionProcessor(address _metaTransactionProcessor, bool _enabled) external {
        require(
            msg.sender == admin,
            "only admin can setup metaTransactionProcessors"
        );
        metaTransactionContracts[_metaTransactionProcessor] = _enabled;
        emit MetaTransactionProcessor(_metaTransactionProcessor, _enabled);
    }

    function mint(
        address _creator,
        uint48 _packId,
        bytes32 _hash,
        uint256 _supply,
        uint8 _power,
        address _owner,
        bytes calldata _data
    ) external returns (uint256 tokenId) {
        require(bouncers[msg.sender], "only bouncer allowed to mint");
        require(_owner != address(0), "Invalid owner");
        tokenId = generateTokenId(_creator, _supply, _packId, 0);
        _mint(
            _hash,
            _supply,
            _power,
            msg.sender,
            _owner,
            tokenId,
            _data,
            false
        );
    }

    function generateTokenId(
        address _creator,
        uint256 _supply,
        uint48 _packId,
        uint16 _packIndex
    ) internal pure returns (uint256) {
        require(_supply > 0 && _supply < 2**32, "invalid supply");

        return
            uint256(_creator) *
            uint256(2)**(256 - 160) + // CREATOR
            (_supply == 1 ? uint256(1) * uint256(2)**(256 - 160 - 1) : 0) + // minted as NFT (1) or FT (0) // IS_NFT
            uint256(_packId) *
            (uint256(2)**(256 - 160 - 1 - 32 - 48)) + // packId (unique pack) // PACk_ID
            _packIndex; // packIndex (position in the pack) // PACK_INDEX
    }

    function _mint(
        bytes32 _hash,
        uint256 _supply,
        uint8 _power,
        address _operator,
        address _owner,
        uint256 _tokenId,
        bytes memory _data,
        bool _extraction
    ) internal {
        uint256 uriId = _tokenId & URI_ID;
        if (!_extraction) {
            require(uint256(metadataHash[uriId]) == 0, "id already used");
            metadataHash[uriId] = _hash;
            require(_power < 4, "power >= 4");
            bytes memory _pack = new bytes(1);
            _pack[0] = bytes1(_power * 64);
            powerPack[uriId] = _pack;
        }
        if (_supply == 1) {
            // ERC721
            numNFTPerAddress[_owner]++;
            owners[_tokenId] = _owner;
            emit Transfer(address(0), _owner, _tokenId);
        } else {
            (uint256 bin, uint256 index) = _tokenId.getTokenBinIndex();
            packedTokenBalance[_owner][bin] = packedTokenBalance[_owner][bin]
                .updateTokenBalance(
                index,
                _supply,
                ObjectLib32.Operations.REPLACE
            );
        }

        emit TransferSingle(_operator, address(0), _owner, _tokenId, _supply);
        require(
            _checkERC1155AndCallSafeTransfer(
                _operator,
                address(0),
                _owner,
                _tokenId,
                _supply,
                _data,
                false,
                false
            ),
            "transfer rejected"
        );
    }

    function mintMultiple(
        address _creator,
        uint48 _packId,
        bytes32 _hash,
        uint256[] calldata _supplies,
        bytes calldata _powerPack,
        address _owner,
        bytes calldata _data
    ) external returns (uint256[] memory tokenIds) {
        require(bouncers[msg.sender], "only bouncer allowed to mint");
        require(_owner != address(0), "Invalid owner");
        uint16 numNFTs;
        (tokenIds, numNFTs) = allocateIds(
            _creator,
            _supplies,
            _powerPack,
            _packId,
            _hash
        );
        _mintBatches(_supplies, _owner, tokenIds, numNFTs);
        completeMultiMint(msg.sender, _owner, tokenIds, _supplies, _data);
    }

    function allocateIds(
        address _creator,
        uint256[] memory _supplies,
        bytes memory _powerPack,
        uint48 _packId,
        bytes32 _hash
    ) internal returns (uint256[] memory tokenIds, uint16 numNFTs) {
        require(_supplies.length > 0, "supplies > 0");
        // do not need to check length as extra will not be considered : this is jsut a waste of gas
        // require(
        //     _powerPack.length <= ((_supplies.length-1) / 4) + 1,
        //     "power too many"
        // );
        (tokenIds, numNFTs) = generateTokenIds(_creator, _supplies, _packId);
        uint256 uriId = tokenIds[0] & URI_ID;
        require(uint256(metadataHash[uriId]) == 0, "id already used");
        metadataHash[uriId] = _hash;
        powerPack[uriId] = _powerPack;
    }

    function generateTokenIds(
        address _creator,
        uint256[] memory _supplies,
        uint48 _packId
    ) internal pure returns (uint256[] memory, uint16) {
        require(_supplies.length < 2**15, "too big batch");
        uint256[] memory tokenIds = new uint256[](_supplies.length);
        uint16 numNFTs = 0;
        for (uint16 i = 0; i < _supplies.length; i++) {
            if (numNFTs == 0) {
                if (_supplies[i] == 1) {
                    numNFTs = uint16(_supplies.length - i);
                }
            } else {
                require(_supplies[i] == 1, "nft need to be put at the end");
            }
            tokenIds[i] = generateTokenId(_creator, _supplies[i], _packId, i);
        }
        return (tokenIds, numNFTs);
    }

    function completeMultiMint(
        address _operator,
        address _owner,
        uint256[] memory tokenIds,
        uint256[] memory _supplies,
        bytes memory _data
    ) internal {
        emit TransferBatch(_operator, address(0), _owner, tokenIds, _supplies);
        require(
            _checkERC1155AndCallSafeBatchTransfer(
                _operator,
                address(0),
                _owner,
                tokenIds,
                _supplies,
                _data
            ),
            "transfer rejected"
        );
    }

    function _mintBatches(
        uint256[] memory _supplies,
        address _owner,
        uint256[] memory _tokenIds,
        uint16 numNFTs
    ) internal {
        uint16 offset = 0;
        while (offset < _supplies.length - numNFTs) {
            _mintBatch(offset, _supplies, _owner, _tokenIds);
            offset += 8;
        }
        // deal with NFT last. they do not care of balance packing
        if (numNFTs > 0) {
            _mintNFTs(
                uint16(_supplies.length - numNFTs),
                numNFTs,
                _owner,
                _tokenIds
            );
        }
    }

    // solium-disable-next-line security/no-assign-params
    function _mintNFTs(
        uint16 offset,
        uint32 numNFTs,
        address _owner,
        uint256[] memory _tokenIds
    ) internal {
        for (uint16 i = 0; i < numNFTs; i++) {
            uint256 _tokenId = _tokenIds[i + offset];
            owners[_tokenId] = _owner;
            emit Transfer(address(0), _owner, _tokenId);
        }
        numNFTPerAddress[_owner] += numNFTs;
    }

    function _mintBatch(
        uint16 offset,
        uint256[] memory _supplies,
        address _owner,
        uint256[] memory _tokenIds
    ) internal {
        uint256 firstId = _tokenIds[offset];
        (uint256 bin, uint256 index) = firstId.getTokenBinIndex();
        uint256 balances = packedTokenBalance[_owner][bin];
        for (uint256 i = 0; i < 8 && offset + i < _supplies.length; i++) {
            uint256 j = offset + i;
            if (_supplies[j] > 1) {
                balances = balances.updateTokenBalance(
                    index + i,
                    _supplies[j],
                    ObjectLib32.Operations.REPLACE
                );
            } else {
                break;
            }
        }
        packedTokenBalance[_owner][bin] = balances;
    }

    function _transferFrom(
        address _from,
        address _to,
        uint256 _id,
        uint256 _value
    ) internal {
        require(_to != address(0), "Invalid to address");
        require(_from != address(0), "Invalid from address");
        if (_from != msg.sender && !metaTransactionContracts[msg.sender]) {
            require(
                mSuperOperators[msg.sender] ||
                    operatorsForAll[_from][msg.sender] ||
                    erc721_operators[_id] == msg.sender,
                "Operator not approved"
            );
        }

        if (_id & IS_NFT > 0) {
            require(owners[_id] == _from, "not owner");
            require(_value == 1, "cannot transfer nft if amount not 1");
            numNFTPerAddress[_from]--;
            numNFTPerAddress[_to]++;
            owners[_id] = _to;
            erc721_operators[_id] = address(0);
            emit Transfer(_from, _to, _id);
        } else {
            // if different owners it will fails
            require(_value > 0, "cannot transfer 0 value");
            (uint256 bin, uint256 index) = _id.getTokenBinIndex();
            packedTokenBalance[_from][bin] = packedTokenBalance[_from][bin]
                .updateTokenBalance(index, _value, ObjectLib32.Operations.SUB);
            packedTokenBalance[_to][bin] = packedTokenBalance[_to][bin]
                .updateTokenBalance(index, _value, ObjectLib32.Operations.ADD);
        }

        emit TransferSingle(
            metaTransactionContracts[msg.sender] ? _from : msg.sender,
            _from,
            _to,
            _id,
            _value
        );
    }

    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _id,
        uint256 _value,
        bytes calldata _data
    ) external {
        _transferFrom(_from, _to, _id, _value);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeTransfer(
                metaTransactionContracts[msg.sender] ? _from : msg.sender,
                _from,
                _to,
                _id,
                _value,
                _data,
                false,
                false
            ),
            "failCheck"
        );
    }

    // NOTE: call data should be optimized to order _ids so packedBalance can be used efficiently
    function safeBatchTransferFrom(
        address _from,
        address _to,
        uint256[] calldata _ids,
        uint256[] calldata _values,
        bytes calldata _data
    ) external {
        _batchTransferFrom(_from, _to, _ids, _values);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeBatchTransfer(
                metaTransactionContracts[msg.sender] ? _from : msg.sender,
                _from,
                _to,
                _ids,
                _values,
                _data
            )
        );
    }

    function _batchTransferFrom(
        address _from,
        address _to,
        uint256[] memory _ids,
        uint256[] memory _values
    ) internal {
        uint256 numItems = _ids.length;
        require(numItems > 0, "need at least one id");
        require(
            numItems == _values.length,
            "Inconsistent array length between args"
        );
        require(_to != address(0), "Invalid recipient");
        require(_from != address(0), "Invalid from address");
        bool authorized = _from == msg.sender ||
            mSuperOperators[msg.sender] ||
            operatorsForAll[_from][msg.sender] ||
            metaTransactionContracts[msg.sender]; // solium-disable-line max-len

        uint256 bin;
        uint256 index;
        uint256 balFrom;
        uint256 balTo;

        // Last bin updated
        uint256 lastBin;
        uint256 numNFTs = 0;
        for (uint256 i = 0; i < numItems; i++) {
            if (_ids[i] & IS_NFT > 0) {
                require(
                    authorized || erc721_operators[_ids[i]] == msg.sender,
                    "Operator not approved"
                );
                require(owners[_ids[i]] == _from, "not owner");
                require(_values[i] == 1, "cannot transfer nft if amount not 1");
                numNFTs++;
                numNFTPerAddress[_to]++;
                owners[_ids[i]] = _to;
                erc721_operators[_ids[i]] = address(0);
                emit Transfer(_from, _to, _ids[i]);
            } else {
                require(authorized, "Operator not approved");
                require(_values[i] > 0, "cannot transfer 0 values");
                (bin, index) = _ids[i].getTokenBinIndex();
                // If first bin
                if (lastBin == 0) {
                    lastBin = bin;
                    balFrom = ObjectLib32.updateTokenBalance(
                        packedTokenBalance[_from][bin],
                        index,
                        _values[i],
                        ObjectLib32.Operations.SUB
                    );
                    balTo = ObjectLib32.updateTokenBalance(
                        packedTokenBalance[_to][bin],
                        index,
                        _values[i],
                        ObjectLib32.Operations.ADD
                    );
                } else {
                    // If new bin
                    if (bin != lastBin) {
                        // _ids need to be ordered appropriately to benefit for optimization
                        // Update storage balance of previous bin
                        packedTokenBalance[_from][lastBin] = balFrom;
                        packedTokenBalance[_to][lastBin] = balTo;

                        // Load current bin balance in memory
                        balFrom = packedTokenBalance[_from][bin];
                        balTo = packedTokenBalance[_to][bin];

                        // Bin will be the most recent bin
                        lastBin = bin;
                    }

                    // Update memory balance
                    balFrom = balFrom.updateTokenBalance(
                        index,
                        _values[i],
                        ObjectLib32.Operations.SUB
                    );
                    balTo = balTo.updateTokenBalance(
                        index,
                        _values[i],
                        ObjectLib32.Operations.ADD
                    );
                }
            }
        }
        if (numNFTs > 0) {
            numNFTPerAddress[_from] -= numNFTs;
        }

        if (balTo != 0) { // if needed
            // Update storage of the last bin visited
            packedTokenBalance[_from][bin] = balFrom;
            packedTokenBalance[_to][bin] = balTo;
        }

        emit TransferBatch(
            metaTransactionContracts[msg.sender] ? _from : msg.sender,
            _from,
            _to,
            _ids,
            _values
        );
    }

    function balanceOf(address _owner, uint256 _tokenId)
        public
        view
        returns (uint256)
    {
        if (_tokenId & IS_NFT > 0) {
            if (owners[_tokenId] == _owner) {
                return 1;
            } else {
                return 0;
            }
        }
        (uint256 bin, uint256 index) = _tokenId.getTokenBinIndex();
        return packedTokenBalance[_owner][bin].getValueInBin(index);
    }

    function balanceOfBatch(
        address[] calldata _owners,
        uint256[] calldata _tokenIds
    ) external view returns (uint256[] memory) {
        require(
            _owners.length == _tokenIds.length,
            "Inconsistent array length between args"
        );
        uint256[] memory balances = new uint256[](_tokenIds.length);
        for (uint256 i = 0; i < _tokenIds.length; i++) {
            balances[i] = balanceOf(_owners[i], _tokenIds[i]);
        }
        return balances;
    }

    // cannot be used to test existence, will return a creator for non existing tokenId
    function creatorOf(uint256 _tokenId) external view returns (address) {
        address originalCreator = address(_tokenId / 2**(256 - 160));
        address newCreator = creatorship[originalCreator];
        if (newCreator != address(0)) {
            return newCreator;
        }
        return originalCreator;
    }

    function transferCreatorship(
        address _sender,
        address _original,
        address _to
    ) external {
        require(
            msg.sender == _sender ||
                metaTransactionContracts[msg.sender] ||
                mSuperOperators[msg.sender],
            "require meta approval"
        );
        require(_sender != address(0)); // solium-disable-line error-reason
        require(_to != address(0)); // solium-disable-line error-reason
        address current = creatorship[_original];
        if (current == address(0)) {
            current = _original;
        }
        require(current != _to); // solium-disable-line error-reason
        require(current == _sender); // solium-disable-line error-reason
        if (_to == _original) {
            creatorship[_original] = address(0);
        } else {
            creatorship[_original] = _to;
        }
        emit CreatorshipTransfer(_original, current, _to);
    }

    // Operators /////////////////////////////////////////////////////////////////////////////////////

    // used for Meta Transaction (from metaTransactionContract)
    function setApprovalForAllFor(
        address _sender,
        address _operator,
        bool _approved
    ) external {
        require(_sender != address(0), "Invalid _sender address");
        require(
            msg.sender == _sender ||
                metaTransactionContracts[msg.sender] ||
                mSuperOperators[msg.sender],
            "require meta approval"
        );
        _setApprovalForAll(_sender, _operator, _approved);
    }
    function setApprovalForAll(address _operator, bool _approved) external {
        _setApprovalForAll(msg.sender, _operator, _approved);
    }
    function _setApprovalForAll(
        address _sender,
        address _operator,
        bool _approved
    ) internal {
        require(
            !mSuperOperators[_operator],
            "super operator can't have their approvalForAll changed"
        );
        operatorsForAll[_sender][_operator] = _approved;
        emit ApprovalForAll(_sender, _operator, _approved);
    }
    function isApprovedForAll(address _owner, address _operator)
        external
        view
        returns (bool isOperator)
    {
        return operatorsForAll[_owner][_operator] || mSuperOperators[_operator];
    }
    //////////////////////////////////////////////////////////////////////////////////////////////////////

    // ERC721 ///////////////////////////////////////
    function balanceOf(address _owner)
        external
        view
        returns (uint256 _balance)
    {
        require(_owner != address(0)); // solium-disable-line error-reason
        return numNFTPerAddress[_owner];
    }
    function ownerOf(uint256 _id) external view returns (address _owner) {
        _owner = owners[_id];
        require(_owner != address(0)); // solium-disable-line error-reason
    }

    // used for Meta Transaction (from metaTransactionContract)
    function approveFor(address _sender, address _operator, uint256 _id)
        external
    {
        address owner = owners[_id];
        require(_sender != address(0), "Invalid sender address");
        require(
            msg.sender == _sender ||
                metaTransactionContracts[msg.sender] ||
                mSuperOperators[msg.sender] ||
                operatorsForAll[_sender][msg.sender],
            "require operators"
        ); // solium-disable-line max-len
        require(owner == _sender); // solium-disable-line error-reason
        erc721_operators[_id] = _operator;
        emit Approval(owner, _operator, _id);
    }
    function approve(address _operator, uint256 _id) external {
        address owner = owners[_id];
        require(owner != address(0), "token does not exist");
        require( // solium-disable-line error-reason
            owner == msg.sender ||
                mSuperOperators[msg.sender] ||
                operatorsForAll[owner][msg.sender]
        );
        erc721_operators[_id] = _operator;
        emit Approval(owner, _operator, _id);
    }
    function getApproved(uint256 _id)
        external
        view
        returns (address _operator)
    {
        require(owners[_id] != address(0)); // solium-disable-line error-reason
        return erc721_operators[_id];
    }
    function transferFrom(address _from, address _to, uint256 _id) external {
        require(_to != address(0)); // solium-disable-line error-reason
        require(_from != address(0), "Invalid from address");
        require(owners[_id] == _from, "not owned by from"); // solium-disable-line error-reason
        if (msg.sender != _from && !metaTransactionContracts[msg.sender]) {
            require(
                operatorsForAll[_from][msg.sender] ||
                    erc721_operators[_id] == msg.sender ||
                    mSuperOperators[msg.sender],
                "Operator not approved"
            );
        }
        _transferFrom(_from, _to, _id, 1);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeTransfer(
                metaTransactionContracts[msg.sender] ? _from : msg.sender,
                _from,
                _to,
                _id,
                1,
                "",
                true,
                false
            )
        );
    }
    function safeTransferFrom(address _from, address _to, uint256 _id)
        external
    {
        safeTransferFrom(_from, _to, _id, "");
    }
    function safeTransferFrom(
        address _from,
        address _to,
        uint256 _id,
        bytes memory _data
    ) public {
        require(_to != address(0)); // solium-disable-line error-reason
        require(_from != address(0), "Invalid from address");
        require(owners[_id] == _from, "not owned by from"); // solium-disable-line error-reason
        if (msg.sender != _from && !metaTransactionContracts[msg.sender]) {
            require(
                operatorsForAll[_from][msg.sender] ||
                    erc721_operators[_id] == msg.sender ||
                    mSuperOperators[msg.sender],
                "Operator not approved"
            );
        }
        _transferFrom(_from, _to, _id, 1);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeTransfer(
                metaTransactionContracts[msg.sender] ? _from : msg.sender,
                _from,
                _to,
                _id,
                1,
                _data,
                true,
                true
            )
        );
    }
    function name() external pure returns (string memory _name) {
        return "ASSET NFT";
    }
    function symbol() external pure returns (string memory _symbol) {
        return "ASSET";
    }

    // cannot be used to test existence, will return a rarity for non existing tokenId
    function power(uint256 _tokenId) public view returns (uint256) {
        bytes storage _powerPack = powerPack[_tokenId & URI_ID];
        uint256 packIndex = _tokenId & PACK_INDEX;
        if (packIndex / 4 >= _powerPack.length) {
            return 0;
        } else {
            uint8 pack = uint8(_powerPack[packIndex / 4]);
            uint8 i = (3 - uint8(packIndex % 4)) * 2;
            return (pack / (uint8(2)**i)) % 4;
        }
    }

    function collection(uint256 _tokenId) public view returns (uint256) {
        require(owners[_tokenId] != address(0)); // solium-disable-line error-reason
        return _tokenId & NOT_NFT_INDEX & NOT_IS_NFT;
    }

    function collectionIndex(uint256 _tokenId) public view returns (uint256) {
        require(owners[_tokenId] != address(0)); // solium-disable-line error-reason
        return uint32((_tokenId & NFT_INDEX) >> 63);
    }

    function toFullURI(bytes32 _hash, uint256 _tokenId)
        internal
        pure
        returns (string memory)
    {
        return
            string(
                abi.encodePacked(
                    "ipfs://bafybei",
                    hash2base32(_hash),
                    "/",
                    uint2str(_tokenId & PACK_INDEX),
                    ".json"
                )
            );
    }

    // cannot be used to test existence, will return a uri for non existing tokenId
    function uri(uint256 _tokenId) public view returns (string memory) {
        return toFullURI(metadataHash[_tokenId & URI_ID], _tokenId);
    }

    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        require(owners[_tokenId] != address(0)); // solium-disable-line error-reason
        return toFullURI(metadataHash[_tokenId & URI_ID], _tokenId);
    }

    bytes32 private constant base32Alphabet = 0x6162636465666768696A6B6C6D6E6F707172737475767778797A323334353637;
    // solium-disable-next-line security/no-assign-params
    function hash2base32(bytes32 _hash)
        private
        pure
        returns (string memory _uintAsString)
    {
        uint256 _i = uint256(_hash);
        uint256 k = 52;
        bytes memory bstr = new bytes(k);
        bstr[--k] = base32Alphabet[uint8((_i % 8) << 2)]; // uint8 s = uint8((256 - skip) % 5);  // (_i % (2**s)) << (5-s)
        _i /= 8;
        while (k > 0) {
            bstr[--k] = base32Alphabet[_i % 32];
            _i /= 32;
        }
        return string(bstr);
    }

    // solium-disable-next-line security/no-assign-params
    function uint2str(uint256 _i)
        private
        pure
        returns (string memory _uintAsString)
    {
        if (_i == 0) {
            return "0";
        }

        uint256 j = _i;
        uint256 len;
        while (j != 0) {
            len++;
            j /= 10;
        }

        bytes memory bstr = new bytes(len);
        uint256 k = len - 1;
        while (_i != 0) {
            bstr[k--] = bytes1(uint8(48 + (_i % 10)));
            _i /= 10;
        }

        return string(bstr);
    }
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    function supportsInterface(bytes4 id) external view returns (bool) {
        return
            id == 0x01ffc9a7 || //ERC165
            id == 0xd9b67a26 || // ERC1155
            id == 0x80ac58cd || // ERC721
            id == 0x5b5e139f || // ERC721 metadata
            id == 0x0e89341c; // ERC1155 metadata
    }

    ///////////////////////////////////////// INTERNAL //////////////////////////////////////////////
    bytes4 constant ERC165ID = 0x01ffc9a7;
    function checkIsERC1155Receiver(address _contract)
        internal
        view
        returns (bool)
    {
        bool success;
        bool result;
        bytes memory call_data = abi.encodeWithSelector(
            ERC165ID,
            ERC1155_IS_RECEIVER
        );
        // solium-disable-next-line security/no-inline-assembly
        assembly {
            let call_ptr := add(0x20, call_data)
            let call_size := mload(call_data)
            let output := mload(0x40) // Find empty storage location using "free memory pointer"
            mstore(output, 0x0)
            success := staticcall(
                10000,
                _contract,
                call_ptr,
                call_size,
                output,
                0x20
            ) // 32 bytes
            result := mload(output)
        }
        // (10000 / 63) "not enough for supportsInterface(...)" // consume all gas, so caller can potentially know that there was not enough gas
        assert(gasleft() > 158);
        return success && result;
    }

    function _checkERC1155AndCallSafeTransfer(
        address _operator,
        address _from,
        address _to,
        uint256 _id,
        uint256 _value,
        bytes memory _data,
        bool erc721,
        bool erc721Safe
    ) internal returns (bool) {
        if (!_to.isContract()) {
            return true;
        }
        if (erc721) {
            if (!checkIsERC1155Receiver(_to)) {
                if (erc721Safe) {
                    return
                        _checkERC721AndCallSafeTransfer(
                            _operator,
                            _from,
                            _to,
                            _id,
                            _data
                        );
                } else {
                    return true;
                }
            }
        }
        return
            ERC1155TokenReceiver(_to).onERC1155Received(
                    _operator,
                    _from,
                    _id,
                    _value,
                    _data
            ) == ERC1155_RECEIVED;
    }

    function _checkERC1155AndCallSafeBatchTransfer(
        address _operator,
        address _from,
        address _to,
        uint256[] memory _ids,
        uint256[] memory _values,
        bytes memory _data
    ) internal returns (bool) {
        if (!_to.isContract()) {
            return true;
        }
        bytes4 retval = ERC1155TokenReceiver(_to).onERC1155BatchReceived(
            _operator,
            _from,
            _ids,
            _values,
            _data
        );
        return (retval == ERC1155_BATCH_RECEIVED);
    }

    function _checkERC721AndCallSafeTransfer(
        address _operator,
        address _from,
        address _to,
        uint256 _id,
        bytes memory _data
    ) internal returns (bool) {
        // following not required as this function is always called as part of ERC1155 checks that include such check already
        // if (!_to.isContract()) {
        //     return true;
        // }
        return (ERC721TokenReceiver(_to).onERC721Received(
                _operator,
                _from,
                _id,
                _data
            ) ==
            ERC721_RECEIVED);
    }

    ////////////////////////////// ERC721 EXTRACTION AND UPDATE ///////////////////////////////

    event Extraction(uint256 indexed _fromId, uint256 _toId);
    event AssetUpdate(uint256 indexed _fromId, uint256 _toId);

    function _burnERC1155(
        address _operator,
        address _from,
        uint256 _tokenId,
        uint32 _amount
    ) internal {
        (uint256 bin, uint256 index) = (_tokenId).getTokenBinIndex();
        packedTokenBalance[_from][bin] = packedTokenBalance[_from][bin]
            .updateTokenBalance(index, _amount, ObjectLib32.Operations.SUB);
        emit TransferSingle(_operator, _from, address(0), _tokenId, _amount);
    }

    function _burnERC721(address _operator, address _from, uint256 _tokenId)
        internal
    {
        require(_from == owners[_tokenId], "not owner");
        owners[_tokenId] = address(0);
        numNFTPerAddress[_from]--;
        emit Transfer(_from, address(0), _tokenId);
        emit TransferSingle(_operator, _from, address(0), _tokenId, 1);
    }

    function burn(uint256 _tokenId, uint256 _amount) external {
        _burn(msg.sender, _tokenId, _amount);
    }

    function burnFrom(address _from, uint256 _tokenId, uint256 _amount) external {
        require(_from != address(0), "invalid from");
        require(
            msg.sender == _from ||
                metaTransactionContracts[msg.sender] ||
                mSuperOperators[msg.sender] ||
                operatorsForAll[_from][msg.sender],
            "require meta approval"
        );
        _burn(_from, _tokenId, _amount);
    }

    function _burn(address _from, uint256 _tokenId, uint256 _amount) internal {
        if ((_tokenId & IS_NFT) > 0) {
            require(_amount == 1, "can only burn one NFT");
            _burnERC721(
                metaTransactionContracts[msg.sender] ? _from : msg.sender,
                _from,
                _tokenId
            );
        } else {
            require(_amount > 0 && _amount < 2**32, "invalid amount");
            _burnERC1155(
                metaTransactionContracts[msg.sender] ? _from : msg.sender,
                _from,
                _tokenId,
                uint32(_amount)
            );
        }
    }

    function updateERC721(
        address _from,
        uint256 _tokenId,
        uint48 _packId,
        bytes32 _hash,
        uint8 _newPower,
        address _to,
        bytes calldata _data
    ) external returns(uint256) {
        require(
            bouncers[msg.sender],
            "only bouncer allowed to mint via update"
        );
        require(_to != address(0), "Invalid to");
        require(_from != address(0), "invalid from");

        _burnERC721(msg.sender, _from, _tokenId);

        uint256 newTokenId = generateTokenId(_from, 1, _packId, 0);
        _mint(_hash, 1, _newPower, msg.sender, _to, newTokenId, _data, false);
        emit AssetUpdate(_tokenId, newTokenId);
        return newTokenId;
    }

    function extractERC721(uint256 _tokenId, address _to)
        external
        returns (uint256 newTokenId)
    {
        return _extractERC721From(msg.sender, msg.sender, _tokenId, _to);
    }

    function extractERC721From(address _sender, uint256 _tokenId, address _to)
        external
        returns (uint256 newTokenId)
    {
        require(
            msg.sender == _sender ||
                metaTransactionContracts[msg.sender] ||
                mSuperOperators[msg.sender] ||
                operatorsForAll[_sender][msg.sender],
            "require meta approval"
        );
        address operator = metaTransactionContracts[msg.sender]
            ? _sender
            : msg.sender;
        return _extractERC721From(operator, _sender, _tokenId, _to);
    }

    function _extractERC721From(address _operator, address _sender, uint256 _tokenId, address _to)
        internal
        returns (uint256 newTokenId)
    {
        require(_to != address(0), "Invalid to");
        require(_tokenId & IS_NFT == 0, "Not an ERC1155 Token");
        uint32 _collectionIndex = nextCollectionIndex[_tokenId];
        newTokenId = _tokenId +
            IS_NFT +
            (_collectionIndex) *
            2**(256 - 160 - 1 - 32);
        nextCollectionIndex[_tokenId] = _collectionIndex + 1;
        _burnERC1155(_operator, _sender, _tokenId, 1);
        _mint(
            metadataHash[_tokenId & URI_ID],
            1,
            0,
            _operator,
            _to,
            newTokenId,
            "",
            true
        );
        emit Extraction(_tokenId, newTokenId);
    }
}

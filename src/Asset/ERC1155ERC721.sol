pragma solidity ^0.5.2;

import "../../contracts_common/src/Interfaces/ERC1155.sol";
import "../../contracts_common/src/Interfaces/ERC1155TokenReceiver.sol";

import "../../contracts_common/src/Libraries/AddressUtils.sol";
import "../../contracts_common/src/Libraries/ObjectLib32.sol";
import "../../contracts_common/src/Libraries/SafeMath.sol";
import "../../contracts_common/src/Libraries/BytesUtil.sol";

import "../../contracts_common/src/Interfaces/ERC721.sol";
import "../../contracts_common/src/Interfaces/ERC721TokenReceiver.sol";
import "../../contracts_common/src/Interfaces/ERC20.sol";

import "./Interfaces/MintingFeeCollector.sol";

import { ProxyImplementation } from "../../contracts_common/src/BaseWithStorage/ProxyImplementation.sol";

contract ERC1155ERC721 is ProxyImplementation, ERC1155, ERC721 {

    ////////////////// Super Operators ///////////////////////////////////////////////////////
    // Allowing extension without redeploy
    mapping(address => bool) internal mSuperOperators;
    address public admin;
    event AdminChanged(address oldAdmin, address newAdmin);
    function changeAdmin(address _admin) external {
        require(msg.sender == admin, "only admin can change admin");
        emit AdminChanged(admin, _admin);
        admin = _admin;
    }
    event SuperOperator(address superOperator, bool enabled);
    function setSuperOperator(address _superOperator, bool _enabled) external {
        require(msg.sender == admin, "only admin is allowed to add super operators");
        mSuperOperators[_superOperator] = _enabled;
        emit SuperOperator(_superOperator, _enabled);
    }
    function isSuperOperator(address who) public view returns(bool) {
        return mSuperOperators[who];
    }
    /////////////////////////////////////////////////////////////////////////////////////////////

    // LIBRARIES /////////////////////////////////////////////////////////////////////////
    using AddressUtils for address;
    using ObjectLib32 for ObjectLib32.Operations;
    using ObjectLib32 for uint256;
    using SafeMath for uint256;
    ///////////////////////////////////////////////////////////////////////////////////////////////

    // CONSTANTS //////////////////////////////////////////////////////////////////////////////////
    bytes4 constant private ERC1155_IS_RECEIVER = 0x0d912442;
    bytes4 constant private ERC1155_RECEIVED = 0xf23a6e61;
    bytes4 constant private ERC1155_BATCH_RECEIVED = 0xbc197c81;
    bytes4 constant private ERC721_RECEIVED = 0x150b7a02;
    ///////////////////////////////////////////////////////////////////////////////////////////////

    event CreatorshipTransfer(address indexed original, address indexed from, address indexed to);

    // STORAGE /////////////////////////////////////////////////////////////////////////////////////
    mapping(address => uint256) numNFTPerAddress; // required for erc721
    mapping(uint256 => address) owners; // required for erc721
    mapping(address => mapping(uint256 => uint256)) packedTokenBalance; // required for erc1155
    mapping(address => mapping(address => bool)) operatorsForAll; // required for erc721 and erc1155
    mapping(uint256 => address) erc721_operators; // required for erc721
    mapping(uint256 => string) public erc721_metadataURIs; // required for erc721
    mapping(uint256 => bytes32) public erc1155_metadataURIHashes; // required for extraction
    mapping(uint256 => uint32) public burnt;

    mapping(address => address) creatorship;

    uint256 public mintingFee;
    ERC20 public feeToken;
    address feeCollector;
    address metaTransactionContract;
    ///////////////////////////////////////////////////////////////////////////////////////////////

    constructor(address _metaTransactionContract, address _feeCollector, address _admin) public {
        initERC1155ERC721(_metaTransactionContract, _feeCollector, _admin);
    }

    function initERC1155ERC721(address _metaTransactionContract, address _feeCollector, address _admin) public phase('ERC1155ERC721'){
        metaTransactionContract = _metaTransactionContract;
        feeCollector = _feeCollector;
        admin = _admin;
    }

    function setFeeCollection(address _newFeeCollector, ERC20 _newFeeToken, uint256 _newFee) external {
        require(msg.sender == feeCollector, "only feeCollector can update");
        feeCollector = _newFeeCollector;
        mintingFee = _newFee;
        feeToken = _newFeeToken;
    }

    function mint(
        address _sender,
        uint256 _fee,
        uint56 _subId,
        string calldata _uri,
        uint32 _supply,
        address _owner,
        bytes calldata _data
    ) external returns (uint256 tokenId) {
        require(_owner != address(0), "Invalid owner");
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender], "sender not authorized");
        require(_fee == mintingFee, "fee not matching");
        if(_fee > 0) {
            feeToken.transferFrom(_sender, feeCollector, _fee);
        }
        require(bytes(_uri).length > 0, "uri cannot be an empty string");
        tokenId = generateTokenId(_sender, _supply, _subId);
        _mint(_uri, _supply, _sender, _owner, tokenId, _data, false);
        if(feeCollector.isContract()) {
            MintingFeeCollector(feeCollector).single_minted(tokenId, _fee);
        }
    }

    function generateTokenId(address _creator, uint256 _supply, uint56 _subId) internal returns (uint256) {
        require(_supply < 2**32, "supply >= 2**32");
        return uint256(_creator) * 2**(256-160) + (_supply == 1 ? 0 :  1 * 2**(256-160-1)) + _subId;
    }

    function _mint(
        string memory _uri,
        uint256 _supply,
        address _creator,
        address _owner,
        uint256 tokenId,
        bytes memory _data,
        bool extraction
    ) internal {
        uint256 id = tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF;
        if(!extraction) {
            require(
                uint256(erc1155_metadataURIHashes[id]) == 0,
                "id already used"
            );
            require(
                owners[tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF] == address(0),
                "tokenId already used"
            );
        }

        if(_supply == 1) { // ERC721
            numNFTPerAddress[_owner] ++;
            owners[tokenId] = _owner;
            emit Transfer(address(0), _owner, tokenId);
            if(!extraction || (tokenId & 0x000000000000000000000000000000000000000000FFFFFFFF00000000000000) == 0) { // first
                erc721_metadataURIs[id] = _uri;
            }
        } else {
            (uint256 bin, uint256 index) = id.getTokenBinIndex();
            packedTokenBalance[_owner][bin] = packedTokenBalance[_owner][bin].updateTokenBalance(
                index, _supply, ObjectLib32.Operations.REPLACE
            );
            erc1155_metadataURIHashes[id] = keccak256(abi.encodePacked(_uri));
        }

        emit TransferSingle(_creator, address(0), _owner, tokenId, _supply);
        emit URI(_uri, tokenId);

        require(
            _checkERC1155AndCallSafeTransfer(_creator, address(0), _owner, tokenId, _supply, _data, _supply == 1, false),
            "transfer rejected"
        );
    }

    function mintMultiple(
        address _sender,
        uint256 _fee,
        uint56 firstSubId,
        string calldata _uris,
        uint16[] calldata lengths,
        uint256[] calldata _supplies,
        address _owner,
        bytes calldata _data
    ) external {
        require(_owner != address(0), "Invalid owner");
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender], "sender not authorized");
        require(_fee == mintingFee * _supplies.length, "fee not matching");
        require(lengths.length == _supplies.length, "Inconsistent array length between lengths and supplies.");
        uint256[] memory tokenIds = generateTokenIds(_sender, _supplies, firstSubId, lengths.length);
        _mintBatchesWithNFTs(_sender, _uris, lengths, _supplies, 0, _owner, tokenIds);
        emit TransferBatch(_sender, address(0), _owner, tokenIds, _supplies);
        require(
            _checkERC1155AndCallSafeBatchTransfer(_sender, address(0), _owner, tokenIds, _supplies, _data),
            "transfer rejected"
        );
        if(_fee > 0) {
            feeToken.transferFrom(_sender, feeCollector, _fee);
        }
        if(feeCollector.isContract()) {
            MintingFeeCollector(feeCollector).multiple_minted(tokenIds, mintingFee);
        }
    }

    function generateTokenIds(
        address _creator,
        uint256[] memory _supplies,
        uint56 firstSubId,
        uint256 numTokens
    ) internal returns (uint256[] memory){
        uint256[] memory tokenIds = new uint256[](numTokens);
        for(uint16 i = 0; i < numTokens; i++) {
            if(i < _supplies.length) {
                tokenIds[i] = generateTokenId(_creator, _supplies[i], firstSubId + i);
            } else {
                tokenIds[i] = generateTokenId(_creator, 1, firstSubId + i);
            }
        }
        return tokenIds;
    }

    function mintMultipleWithNFT(
        address _sender,
        uint256 _fee,
        uint56 firstSubId,
        string calldata _uris,
        uint16[] calldata lengths,
        uint256[] calldata _supplies,
        uint16 numNFTs,
        address _owner,
        bytes calldata _data
    ) external {
        require(_owner != address(0), "Invalid owner");
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender], "sender not authorized");
        require(lengths.length == _supplies.length + numNFTs, "Inconsistent array length between args lengths and supplies.");
        require(_fee == mintingFee * lengths.length, "fee not matching");
        if(_fee > 0) {
            feeToken.transferFrom(_sender, feeCollector, _fee);
        }
        uint256[] memory tokenIds = generateTokenIds(_sender, _supplies, firstSubId, lengths.length);
        _mintBatchesWithNFTs(_sender, _uris, lengths, _supplies, numNFTs, _owner, tokenIds);
        emit TransferBatch(_sender, address(0), _owner, tokenIds, _supplies);
        require(
            _checkERC1155AndCallSafeBatchTransfer(_sender, address(0), _owner, tokenIds, _supplies, _data),
            "transfer rejected"
        );
        if(feeCollector.isContract()) {
            MintingFeeCollector(feeCollector).multiple_minted(tokenIds, mintingFee);
        }
    }

    function _mintBatchesWithNFTs(
        address _creator,
        string memory _uris,
        uint16[] memory lengths,
        uint256[] memory _supplies,
        uint16 numNFTs,
        address _owner,
        uint256[] memory _tokenIds
    ) internal {
        bytes memory stringBytes = bytes(_uris);
        uint32 readingPointer = _mintBatches(stringBytes, lengths, _supplies, _creator, _owner, _tokenIds);
        // deal with NFT last. they do not care of balance packing
        if(numNFTs > 0 ) {
            _mintNFTs(stringBytes, readingPointer, uint16(_supplies.length), lengths, numNFTs, _creator, _owner, _tokenIds);
        }
    }

    function _mintBatches(
        bytes memory stringBytes,
        uint16[] memory lengths,
        uint256[] memory _supplies,
        address _creator,
        address _owner,
        uint256[] memory _tokenIds
    ) internal returns (uint32 readingPointer) {
        readingPointer = 0x20;
        uint16 offset = 0;
        (, uint256 index) = (_tokenIds[0] & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF).getTokenBinIndex();
        uint16 batchSize = uint16(8 - index);
        while(offset < uint16(_supplies.length)) {
            readingPointer = _mintBatch(
                stringBytes, readingPointer, offset, lengths, _supplies, _creator, _owner, _tokenIds, batchSize
            );
            offset += batchSize;
            batchSize = 8;
        }
    }

    // solium-disable-next-line security/no-assign-params
    function _mintNFTs(
        bytes memory stringBytes,
        uint32 readingPointer,
        uint16 offset,
        uint16[] memory lengths,
        uint32 numNFTs,
        address _creator,
        address _owner,
        uint256[] memory _tokenIds
    ) internal {
        for (uint16 i = 0; i < numNFTs; i++) {
            numNFTPerAddress[_owner] ++;
            uint256 _tokenId = _tokenIds[i+offset];
            uint256 id = _tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF;
            require(
                uint256(erc1155_metadataURIHashes[id]) == 0,
                "id already used"
            );
            require(
                owners[_tokenId] == address(0),
                "tokenId already used"
            );
            owners[_tokenId] = _owner;
            emit Transfer(address(0), _owner, _tokenId);
            uint ptr;
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                ptr := add(stringBytes, readingPointer)
            }
            bytes memory tmp = BytesUtil.pointerToBytes(ptr, lengths[offset + i]);
            readingPointer += lengths[offset + i];
            erc721_metadataURIs[id] = string(tmp);
            emit TransferSingle(_creator, address(0), _owner, _tokenId, 1);
            emit URI(string(tmp), _tokenId);
        }
    }

    function _mintBatch(
        bytes memory stringBytes,
        uint32 readingPointer,
        uint16 offset,
        uint16[] memory lengths,
        uint256[] memory _supplies,
        address _creator,
        address _owner,
        uint256[] memory _tokenIds,
        uint16 batchSize
    ) internal returns(uint32 newReadingPointer) {
        uint256 firstId = _tokenIds[offset] & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF;
        (uint256 bin,) = firstId.getTokenBinIndex();
        (uint32 readingPointer, uint256 newBalance) = _packMintBatch(
            stringBytes,
            readingPointer,
            offset,
            lengths,
            _supplies,
            packedTokenBalance[_owner][bin],
            _tokenIds,
            batchSize
        );
        packedTokenBalance[_owner][bin] = newBalance;
        return readingPointer;
    }

    function _packMintBatch(
        bytes memory stringBytes,
        uint32 readingPointer,
        uint16 offset,
        uint16[] memory lengths,
        uint256[] memory _supplies,
        uint256 _packedBalance,
        uint256[] memory _tokenIds,
        uint16 batchSize
    ) internal returns (
        uint32 newReadingPointer,
        uint256 newBalance
    ) {
        newReadingPointer = readingPointer;
        newBalance = _packedBalance;
        uint256 firstId = _tokenIds[offset] & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF;
        (,uint256 index) = firstId.getTokenBinIndex();
        for (uint256 i = 0; i < batchSize; i++) {
            if(_supplies.length <= offset + i){
                break;
            }
            require(uint256(erc1155_metadataURIHashes[firstId + i]) == 0, "id already used");
            require(
                owners[_tokenIds[offset+i] & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF] == address(0),
                "tokenId already used"
            );
            uint256 j = offset + i;
            uint256 ptr;
            // solium-disable-next-line security/no-inline-assembly
            assembly {
                ptr := add(stringBytes, newReadingPointer)
            }
            bytes memory tmp = BytesUtil.pointerToBytes(ptr, lengths[j]);
            newReadingPointer += lengths[j];
            require(_supplies[j] > 1, "supply == 1 require use of withNFT");
            newBalance = newBalance.updateTokenBalance(index + i, _supplies[j], ObjectLib32.Operations.REPLACE);
            erc1155_metadataURIHashes[firstId + i] = keccak256(tmp);
            emit URI(string(tmp), _tokenIds[offset+i]);
        }
    }

    function _transferFrom(address _from, address _to, uint256 _id, uint256 _value) internal {
        require(_to != address(0), "Invalid to address");
        if(_from != msg.sender && msg.sender != metaTransactionContract) {
            require(mSuperOperators[msg.sender] || operatorsForAll[_from][msg.sender] || erc721_operators[_id] == msg.sender, "Operator not approved");
        }

        if(owners[_id] != address(0)) { // NFT
            require(_value == 1, "cannot transfer nft if amount not 1");
            numNFTPerAddress[_from] --;
            numNFTPerAddress[_to] ++;
            owners[_id] = _to;
            if(erc721_operators[_id] != address(0)) {
                erc721_operators[_id] = address(0);
            }
            emit Transfer(_from, _to, _id);
        } else {
            (uint256 bin, uint256 index) = (_id & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF).getTokenBinIndex();
            packedTokenBalance[_from][bin] = packedTokenBalance[_from][bin].updateTokenBalance(
                    index, _value, ObjectLib32.Operations.SUB
            );
            packedTokenBalance[_to][bin] = packedTokenBalance[_to][bin].updateTokenBalance(
                    index, _value, ObjectLib32.Operations.ADD
            );
        }

        emit TransferSingle(msg.sender == metaTransactionContract ? _from : msg.sender, _from, _to, _id, _value);
    }

    // function transferFrom(address _from, address _to, uint256 _id, uint256 _value) external {
    //     _transferFrom(_from, _to, _id, _value);
    // }
    function safeTransferFrom(address _from, address _to, uint256 _id, uint256 _value, bytes calldata _data) external {
        _transferFrom(_from, _to, _id, _value);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeTransfer(msg.sender == metaTransactionContract ? _from : msg.sender, _from, _to, _id, _value, _data, false, false)
        );
    }


    // function batchTransferFrom(address _from, address _to, uint256[]calldata  _ids, uint256[] calldata _values) external {
    //     _batchTransferFrom(_from, _to, _ids, _values);
    // }

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
            _checkERC1155AndCallSafeBatchTransfer(msg.sender == metaTransactionContract ? _from : msg.sender, _from, _to, _ids, _values, _data)
        );
    }

    function _batchTransferFrom(address _from, address _to, uint256[] memory _ids, uint256[] memory _values) internal {
        require(_ids.length == _values.length, "Inconsistent array length between args");
        require(_to != address(0), "Invalid recipient");
        bool authorized = mSuperOperators[msg.sender] || operatorsForAll[_from][msg.sender] || _from == msg.sender || msg.sender == metaTransactionContract; // solium-disable-line max-len

        uint256 bin;
        uint256 index;
        uint256 balFrom;
        uint256 balTo;

        // Last bin updated
        uint256 lastBin;
        for (uint256 i = 0; i < _ids.length; i++) {
            require(authorized || erc721_operators[_ids[i]] == msg.sender, "Operators not approved");
            if(owners[_ids[i]] != address(0)) { // NFT
                require(owners[_ids[i]] == _from, "not owner");
                require(_values[i] == 1, "cannot transfer nft if amount not 1");
                numNFTPerAddress[_from] --;
                numNFTPerAddress[_to] ++;
                owners[_ids[i]] = _to;
                erc721_operators[_ids[i]] = address(0);
                emit Transfer(_from, _to, _ids[i]);
            } else {
                (bin, index) = (_ids[i] & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF).getTokenBinIndex();
                // If first bin
                if (i == 0) {
                    lastBin = bin;
                    balFrom = ObjectLib32.updateTokenBalance(packedTokenBalance[_from][bin], index, _values[i], ObjectLib32.Operations.SUB);
                    balTo = ObjectLib32.updateTokenBalance(packedTokenBalance[_to][bin], index, _values[i], ObjectLib32.Operations.ADD);
                } else {
                    // If new bin
                    if (bin != lastBin) { // _ids need to be ordered appropriately to benefit for optimization
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
                    balFrom = balFrom.updateTokenBalance(index, _values[i], ObjectLib32.Operations.SUB);
                    balTo = balTo.updateTokenBalance(index, _values[i], ObjectLib32.Operations.ADD);
                }
            }
        }

        if(bin != 0 || index != 0) { // at least one MCFT
            // Update storage of the last bin visited
            packedTokenBalance[_from][bin] = balFrom;
            packedTokenBalance[_to][bin] = balTo;
        }

        emit TransferBatch(msg.sender == metaTransactionContract ? _from : msg.sender, _from, _to, _ids, _values);
    }

    function balanceOf(address _owner, uint256 _tokenId) public view returns (uint256) {
        if(owners[_tokenId] != address(0)) {
            if(owners[_tokenId] == _owner) {
                return 1;
            } else {
                return 0;
            }
        }
        (uint256 bin, uint256 index) = (_tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF).getTokenBinIndex();
        return packedTokenBalance[_owner][bin].getValueInBin(index);
    }

    function balanceOfBatch(address[] calldata _owners, uint256[] calldata _tokenIds) external view returns (uint256[] memory){
        require(_owners.length == _tokenIds.length, "Inconsistent array length between args");
        uint256[] memory balances = new uint256[](_tokenIds.length);
        for(uint256 i = 0; i < _tokenIds.length; i++){
            balances[i] = balanceOf(_owners[i], _tokenIds[i]);
        }
        return balances;
    }

    function creatorOf(uint256 _tokenId) external view returns (address) {
        uint256 id = _tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00FFFFFFFFFFFFFFFFFFFFFF;
        require( // solium-disable-line error-reason
            owners[_tokenId] != address(0) || uint256(erc1155_metadataURIHashes[id]) != 0
        );
        address originalCreator = address(_tokenId / 2**(256-160));
        address newCreator = creatorship[originalCreator];
        if(newCreator != address(0)) {
            return newCreator;
        }
        return originalCreator;
        // address storedCreator = creators[_tokenId];
        // if(storedCreator == address(0) && (owners[_tokenId] != address(0) || uint256(erc1155_metadataURIHashes[_id]) != 0)) {
        //     return address(_tokenId / 2**(256-160));
        // }
        // return storedCreator;
    }

    function transferCreatorship(address _sender, address _original, address _to) external {
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender], "require meta approval");
        require(_to != address(0)); // solium-disable-line error-reason
        address current = creatorship[_original];
        if(current == address(0)) {
            current = _original;
        }
        require(current != _to); // solium-disable-line error-reason
        require(current == _sender); // solium-disable-line error-reason
        if(_to == _original) {
            creatorship[_original] = address(0);
        } else {
            creatorship[_original] = _to;
        }
        emit CreatorshipTransfer(_original, current, _to);
    }

    // Operators /////////////////////////////////////////////////////////////////////////////////////

    function setApprovalForAllFor(address _sender, address _operator, bool _approved) external {
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender], "require meta approval");
        _setApprovalForAll(_sender, _operator, _approved);
    }
    function setApprovalForAll(address _operator, bool _approved) external {
        _setApprovalForAll(msg.sender, _operator, _approved);
    }
    function _setApprovalForAll(address _sender, address _operator, bool _approved) internal {
        require(!mSuperOperators[_operator], "super operator can't have their approvalForAll changed");
        operatorsForAll[_sender][_operator] = _approved;
        emit ApprovalForAll(_sender, _operator, _approved);
    }
    function isApprovedForAll(address _owner, address _operator) external view returns (bool isOperator) {
        return operatorsForAll[_owner][_operator] || mSuperOperators[_operator];
    }
    //////////////////////////////////////////////////////////////////////////////////////////////////////

    // ERC721 ///////////////////////////////////////
    function balanceOf(address _owner) external view returns (uint256 _balance) {
        require(_owner != address(0)); // solium-disable-line error-reason
        return numNFTPerAddress[_owner];
    }
    function ownerOf(uint256 _id) external view returns (address _owner){
        _owner = owners[_id];
        require(_owner != address(0)); // solium-disable-line error-reason
    }

    // used for Meta Transaction (from metaTransactionContract)
    function approveFor(address _sender, address _operator, uint256 _id) external {
        address owner = owners[_id];
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender] || operatorsForAll[_sender][msg.sender], "require operators"); // solium-disable-line max-len
        require(owner == _sender); // solium-disable-line error-reason
        erc721_operators[_id] = _operator;
        emit Approval(owner, _operator, _id);
    }
    function approve(address _operator, uint256 _id) external {
        address owner = owners[_id];
        require( // solium-disable-line error-reason
            owner == msg.sender || mSuperOperators[msg.sender] || operatorsForAll[owner][msg.sender]
        );
        erc721_operators[_id] = _operator;
        emit Approval(owner, _operator, _id);
    }
    function getApproved(uint256 _id) external view returns (address _operator){
        require(owners[_id] != address(0)); // solium-disable-line error-reason
        return erc721_operators[_id];
    }
    function transferFrom(address _from, address _to, uint256 _id) external{
        require(_to != address(0)); // solium-disable-line error-reason
        require(owners[_id] == _from); // solium-disable-line error-reason
        if(msg.sender != _from && msg.sender != metaTransactionContract) {
            require(operatorsForAll[_from][msg.sender] || erc721_operators[_id] == msg.sender || mSuperOperators[msg.sender], "Operator not approved");
        }
        _transferFrom(_from, _to, _id, 1);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeTransfer(msg.sender == metaTransactionContract ? _from : msg.sender, _from, _to, _id, 1, "", true, false)
        );
    }
    function safeTransferFrom(address _from, address _to, uint256 _id) external {
        safeTransferFrom(_from, _to, _id, "");
    }
    function safeTransferFrom(address _from, address _to, uint256 _id, bytes memory _data) public {
        require(_to != address(0)); // solium-disable-line error-reason
        require(owners[_id] == _from); // solium-disable-line error-reason
        if(msg.sender != _from && msg.sender != metaTransactionContract) {
            require(operatorsForAll[_from][msg.sender] || erc721_operators[_id] == msg.sender || mSuperOperators[msg.sender], "Operator not approved");
        }
        _transferFrom(_from, _to, _id, 1);
        require( // solium-disable-line error-reason
            _checkERC1155AndCallSafeTransfer(msg.sender == metaTransactionContract ? _from : msg.sender, _from, _to, _id, 1, _data, true, true)
        );
    }
    function name() external pure returns (string memory _name) {
        return "ASSET NFT";
    }
    function symbol() external pure returns (string memory _symbol) {
        return "ASSET";
    }
    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        require(owners[_tokenId] != address(0)); // solium-disable-line error-reason
        return string(erc721_metadataURIs[_tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF]);
    }
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    function supportsInterface(bytes4 id)
    external
    view
    returns (bool) { //ERC165            // ERC1155       // ERC721           // ERC721 metadata
        return id == 0x01ffc9a7 || id == 0xd9b67a26 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    ///////////////////////////////////////// INTERNAL //////////////////////////////////////////////

    function _checkERC1155AndCallSafeTransfer(
        address _operator,
        address _from,
        address _to,
        uint256 _id,
        uint256 _value,
        bytes memory _data,
        bool erc721,
        bool erc721Safe
    )
    internal
    returns (bool)
    {
        if (!_to.isContract()) {
            return true;
        }
        if(erc721) {
            (bool success, bytes memory returnData) = _to.call.gas(5000)(abi.encodeWithSignature("isERC1155TokenReceiver()"));
            bytes4 retval = 0x0;
            if(!success) {
                assert(gasleft() > 79); // (5000 / 63) "not enough for isERC1155TokenReceiver()" // consume all gas, so caller can potentially know that there was not enough gas
            } else if(returnData.length > 0) {
                // solium-disable-next-line security/no-inline-assembly
                assembly {
                    retval := mload(add(returnData, 32))
                }
            }
            if(retval != ERC1155_IS_RECEIVER) {
                if(erc721Safe) {
                    return _checkERC721AndCallSafeTransfer(_operator, _from, _to, _id, _data);
                } else {
                    return true;
                }
            }
        }
        return ERC1155TokenReceiver(_to).onERC1155Received(_operator, _from, _id, _value, _data) == ERC1155_RECEIVED;
    }

    function _checkERC1155AndCallSafeBatchTransfer(
        address _operator,
        address _from,
        address _to,
        uint256[] memory _ids,
        uint256[] memory _values,
        bytes memory _data
    )
    internal
    returns (bool)
    {
        if (!_to.isContract()) {
            return true;
        }
        bytes4 retval = ERC1155TokenReceiver(_to).onERC1155BatchReceived(
            _operator, _from, _ids, _values, _data);
        return (retval == ERC1155_BATCH_RECEIVED);
    }

    function _checkERC721AndCallSafeTransfer(
        address _operator,
        address _from,
        address _to,
        uint256 _id,
        bytes memory _data
    )
    internal
    returns (bool)
    {
        if (!_to.isContract()) {
            return true;
        }
        return (ERC721TokenReceiver(_to).onERC721Received(_operator, _from, _id, _data) == ERC721_RECEIVED);
    }

    ////////////////////////////// ERC721 EXTRACTION ///////////////////////////////

    event Extraction(uint256 indexed _fromId, uint256 _toId, string _uri);

    function _burnERC1155(address _from, uint256 _tokenId, uint32 _amount) internal {
        (uint256 bin, uint256 index) = (_tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF).getTokenBinIndex();
        packedTokenBalance[_from][bin] = packedTokenBalance[_from][bin].updateTokenBalance(index, _amount, ObjectLib32.Operations.SUB);
        burnt[_tokenId] += _amount;
        emit TransferSingle(msg.sender == metaTransactionContract ? _from : msg.sender, _from, address(0), _tokenId, _amount);
    }

    // TODO disable ?
    function extractERC721(address _sender, uint256 _tokenId, string calldata _uri) external {
        uint256 id = _tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF0000000000FFFFFFFFFFFFFF;
        require(msg.sender == _sender || msg.sender == metaTransactionContract || mSuperOperators[msg.sender], "require meta approval");
        require(erc1155_metadataURIHashes[id] != 0, "Not an ERC1155 Token");
        require(erc1155_metadataURIHashes[id] == keccak256(abi.encodePacked(_uri)), "URI hash does not match");
        uint256 newTokenId = id + (burnt[_tokenId]) * 2**(256-160-8-32);
        _burnERC1155(_sender, _tokenId, 1);
        _mint(_uri, 1, _sender, _sender, newTokenId, "", true);
        emit Extraction(_tokenId, newTokenId, _uri);
    }
}
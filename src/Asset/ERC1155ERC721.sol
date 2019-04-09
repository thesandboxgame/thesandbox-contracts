pragma solidity 0.5.2;

import "../Interfaces/ERC1155.sol";

import "../Libraries/AddressUtils.sol";
import "../Libraries/ObjectLib32.sol";
import "../Libraries/SafeMath.sol";
import "../Libraries/BytesUtil.sol";

import "../Interfaces/ERC721.sol";
import "../Interfaces/ERC721TokenReceiver.sol";
import "../Interfaces/ERC20.sol";
import "../Sand.sol";

import { ProxyImplementation } from "../Libraries/ProxyImplementation.sol";

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
    bytes4 constant private ERC1155_RECEIVED = 0xf23a6e61; // TODO use latest spec // better yet : generate it
    bytes4 constant private ERC721_RECEIVED = 0x150b7a02; // TODO use latest spec // better yet : generate it
    ///////////////////////////////////////////////////////////////////////////////////////////////

    // STORAGE /////////////////////////////////////////////////////////////////////////////////////  
    uint256 nextSubId;
    mapping(address => uint256) numNFTPerAddress; // required for erc721
    mapping(uint256 => address) owners; // required for erc721
    mapping(address => mapping(uint256 => uint256)) packedTokenBalance; // required for erc1155
    mapping(address => mapping(address => bool)) operatorsForAll; // required for erc721 and erc1155
    mapping(uint256 => address) erc721_operators; // required for erc721
    mapping(uint256 => address) creators; // use only for when changing original creator // TODO
    mapping (uint256 => string) public erc721_metadataURIs; // required for erc721 (erc1155 in discussion)
    mapping (uint256 => bytes32) public erc1155_metadataURIHashes; // required for extraction // TODO could save uri and remove URI events
    

    uint256 public mintingFee;
    address feeCollector;
    Sand _sandContract;

    ///////////////////////////////////////////////////////////////////////////////////////////////

    // EVENTS /////////////////////////////////////////////////////////////////////////////////////   
    // event Creation(address indexed _creator, uint256 indexed _id, string _uri, uint256 _supply); // extra event for TSB?
    ///////////////////////////////////////////////////////////////////////////////////////////////

    constructor(Sand sand, address _feeCollector, address _admin) public {
        initERC1155ERC721(sand, _feeCollector, _admin);
    }

    function initERC1155ERC721(Sand sand, address _feeCollector, address _admin) public phase('ERC1155ERC721'){
         nextSubId = 1; // set here to non-zero so it can cover the cost of first minting
        _sandContract = sand;
        feeCollector = _feeCollector;
        admin = _admin;
    }

    function sandContract() internal view returns(Sand) {
        return _sandContract;
    }

    function setMintingFee(uint256 _newFee) external {
        require(feeCollector == msg.sender, "only feeCollector can set the minting fee");
        mintingFee = _newFee;
        // TODO event
    }

    function setFeeCollector(address _newFeeCollector) external {
        require(feeCollector == msg.sender, "only feeCollector can update itself");
        feeCollector = _newFeeCollector;
        // TODO event
    }

    // function extractTokenInfo(uint256 _id) public pure returns (address creator, uint40 creationBlockNumber, uint32 supply, uint24 subId){
    //     creator = address(_id / 2**(256-160));
    //     creationBlockNumber = uint40(_id / 2**(256-160-40));
    //     supply = uint32(_id / 2**(256-160-40-32));
    //     subId = uint24(_id);
    // }

    // TODO remove the ability to mint for someone else
    function mint(address _sender, uint256 _sandAmount, string calldata _uri, uint256 _supply, address _owner) external returns (uint256) {
        require(_owner != address(0), "Invalid owner");
        require(_sandAmount == mintingFee, "fee not matching");
        if(_sandAmount > 0) {
            _sandContract.transferFrom(_sender, feeCollector, _sandAmount);
        }
        require(msg.sender == _sender || msg.sender == address(_sandContract), "sender != msg.sender && sandContract");
        require(bytes(_uri).length > 0, "uri cannot be an empty string");
        return _mint(_uri, _supply, _sender, _owner);
    }

    function _mint(string memory _uri, uint256 _supply, address _creator, address _owner) internal returns (uint256 tokenId) {
        tokenId = uint256(_creator) * 2**(256-160) + block.number * 2**(256-160-40) + _supply * 2**(256-160-40-32) + uint24(nextSubId); //nextSubId will rotate
        nextSubId++;
        if(_supply == 1) { // ERC721
            numNFTPerAddress[_owner] ++;
            owners[tokenId] = _owner; // TODO remove ? could save the cost of SSTORE (20,000) by omitting this (but the cost would then added on first transfer)
            emit Transfer(address(0), _owner, tokenId);
            erc721_metadataURIs[tokenId] = _uri;
        } else {
            (uint256 bin, uint256 index) = (tokenId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex(); // ignore supply for bin computation
            packedTokenBalance[_owner][bin] =
            packedTokenBalance[_owner][bin].updateTokenBalance(
                index, _supply, ObjectLib32.Operations.REPLACE
            );
            erc1155_metadataURIHashes[tokenId] = keccak256(abi.encodePacked(_uri));
        }

        emit TransferSingle(address(this), address(0), _owner, tokenId, _supply);
        emit URI(_uri, tokenId);
        // TODO creator event ? // how do we get the creator
    }

    function mintMultiple(address _sender, uint256 _sandAmount, string calldata _uris, uint8[] calldata lengths, uint256[] calldata _supplies, address _owner) external { 
        require(_owner != address(0), "Invalid owner");
        require(msg.sender == _sender || msg.sender == address(_sandContract), "sender != msg.sender && sandContract");
        require(_sandAmount == mintingFee * _supplies.length, "fee not matching");
        if(_sandAmount > 0) {
            _sandContract.transferFrom(_sender, feeCollector, _sandAmount);
        }
        require(lengths.length == _supplies.length, "Inconsistent array length between args lengths and supplies.");
        uint256[] memory tokenIds = new uint256[](lengths.length);
        _mintBatchesWithNFTs(_sender, _uris, lengths, _supplies, 0, _owner, tokenIds);
        emit TransferBatch(msg.sender == address(_sandContract) ? _sender : msg.sender, address(0), _owner, tokenIds, _supplies);
        // TODO creator events ?
    }


    function mintMultipleWithNFT(address _sender, uint256 _sandAmount, string calldata _uris, uint8[] calldata lengths, uint256[] calldata _supplies, uint8 numNFTs, address _owner) external { 
        require(_owner != address(0), "Invalid owner");
        require(msg.sender == _sender || msg.sender == address(_sandContract), "sender != msg.sender && sandContract");
        require(_sandAmount == mintingFee * _supplies.length, "fee not matching");
        if(_sandAmount > 0) {
            _sandContract.transferFrom(_sender, feeCollector, _sandAmount);
        }
        require(lengths.length == _supplies.length + numNFTs, "Inconsistent array length between args lengths and supplies.");
        uint256[] memory tokenIds = new uint256[](lengths.length + numNFTs);
        _mintBatchesWithNFTs(_sender, _uris, lengths, _supplies, numNFTs, _owner, tokenIds);
        emit TransferBatch(msg.sender == address(_sandContract) ? _sender : msg.sender, address(0), _owner, tokenIds, _supplies);
        // TODO creator events ?
    }

    // TODO length uint8 ?
    function _mintBatchesWithNFTs(address _creator, string memory _uris, uint8[] memory lengths, uint256[] memory _supplies, uint8 numNFTs, address _owner, uint256[] memory tokenIds) internal {
        bytes memory stringBytes = bytes(_uris);
        uint16 readingPointer = 0x20; //TODO uint32 ?
        uint8 offset = 0;
        _mintBatches(stringBytes, readingPointer, offset, lengths, _supplies, _creator, _owner, tokenIds);
        // deal with NFT last. they do not care of balance packing
        if(numNFTs > 0 ) {
            _mintNFTs(stringBytes, readingPointer, offset, lengths, numNFTs, _creator, _owner, tokenIds);
        }
    }

    function _mintBatches(bytes memory stringBytes, uint16 readingPointer, uint8 offset, uint8[] memory lengths, uint256[] memory _supplies, address _creator, address _owner, uint256[] memory tokenIds) internal {
        while (offset < _supplies.length) {
            _mintBatch(stringBytes, readingPointer, offset, lengths, _supplies, _creator, _owner, tokenIds);
            uint8 m = uint8(_supplies.length);
            if(m > offset + 8) {
                m = offset + 8;
            }
            for (uint8 i = offset; i < m; i++) {
                readingPointer += lengths[i]; // TODO return as part of _mintBacth instea dof computing it here again ?
            }
            offset = m;
        }
    }

    function _mintNFTs(bytes memory stringBytes, uint16 readingPointer, uint8 offset, uint8[] memory lengths, uint8 numNFTs, address _creator, address _owner, uint256[] memory tokenIds) internal {
        for (uint8 i = 0; i < numNFTs; i++) {
            numNFTPerAddress[_owner] ++;
            uint256 _id = uint256(_creator) * 2**(256-160)  + block.number * 2**(256-160-40) + 1 * 2**(256-160-40-32) + uint24(nextSubId++);
            owners[_id] = _owner; // TODO remove ? could save the cost of SSTORE (20,000) by omitting this (but the cost would then added on first transfer)
            emit Transfer(address(0), _owner, _id);
            uint ptr;
            assembly {
                ptr := add(stringBytes, readingPointer)
            }
            bytes memory tmp = BytesUtil.toBytes(ptr, lengths[offset + i]);
            readingPointer += lengths[offset + i];
            erc721_metadataURIs[_id] = string(tmp);
            tokenIds[offset+ i] = _id;
        }
    }

    function _getFirstId(uint8 batchSize, uint256 supply, address _creator) internal view returns(uint256) {
        uint256 numSlotLeft = 8 - (nextSubId % 8); //ObjectLib32.TYPES_PER_UINT256;
        if(numSlotLeft >= batchSize) { // ObjectLib32.TYPES_PER_UINT256 = 8
            return uint256(_creator) * 2**(256-160)  + block.number * 2**(256-160-40) + supply * 2**(256-160-40-32) + uint24(nextSubId);
        } else {
            return uint256(_creator) * 2**(256-160)  + block.number * 2**(256-160-40) + supply * 2**(256-160-40-32) + uint24(nextSubId + numSlotLeft);
        }
    }

    function _mintBatch(bytes memory stringBytes, uint16 readingPointer, uint8 offset, uint8[] memory lengths, uint256[] memory _supplies, address _creator, address _owner, uint256[] memory tokenIds) internal {
        uint8 batchSize = uint8(_supplies.length) - offset;
        if(batchSize > 8) {
            batchSize = 8;//ObjectLib32.TYPES_PER_UINT256;
        }
        uint256 firstId = _getFirstId(batchSize, _supplies[offset], _creator);
        nextSubId = firstId + batchSize;
        (uint256 bin,) = (firstId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex(); // ignore supply
        for(uint8 i = 0; i < batchSize; i++) {
            tokenIds[offset+i] = firstId + i;
        }
        
        packedTokenBalance[_owner][bin] = _packMintBatch(
            stringBytes,
            readingPointer,
            offset,
            lengths,
            _supplies,
            packedTokenBalance[_owner][bin],
            firstId,
            batchSize
        );
    }

    function _packMintBatch(
        bytes memory stringBytes, 
        uint16 readingPointer,
        uint8 offset,
        uint8[] memory lengths, 
        uint256[] memory _supplies, 
        uint256 _packedBalance, 
        uint256 firstId,
        uint8 batchSize
    ) internal returns (
        uint256 packedBalance
    ) {
        (,uint256 index) = (firstId & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex(); // ignore supply
        for (uint256 i = 0; i < batchSize; i++) {
            uint256 j = offset + i;
            // bytes memory tmp = new bytes(lengths[i]);
            uint ptr;
            assembly {
                ptr := add(stringBytes, readingPointer)
            }
            bytes memory tmp = BytesUtil.toBytes(ptr, lengths[j]);
            readingPointer += lengths[j];
            // TODO support multi mint nft (won't be saving as much gas)?
            require(_supplies[j] > 1, "Minting with supply 1 not supported yet.");
            _packedBalance = _packedBalance.updateTokenBalance(index + i, _supplies[j], ObjectLib32.Operations.REPLACE);
            
            erc1155_metadataURIHashes[firstId + i] = keccak256(tmp);

            emit URI(string(tmp), firstId + i);     
        }
        return _packedBalance;
    }
    
    function _transferFrom(address _from, address _to, uint256 _id, uint256 _value) internal {
        require(_to != address(0), "Invalid to address");
        if(_from != msg.sender && msg.sender != address(_sandContract)) {
            require(mSuperOperators[msg.sender] || operatorsForAll[_from][msg.sender] || erc721_operators[_id] == msg.sender, "Operator not approved");
        }

        if(owners[_id] != address(0)) { // NFT 
            require(_value == 1, "cannot transfer nft if amount not 1");
            numNFTPerAddress[_from] --;
            numNFTPerAddress[_to] ++;
            owners[_id] = _to;
            if(erc721_operators[_id] != address(0)) { erc721_operators[_id] = address(0); }
            emit Transfer(_from, _to, _id);
        } else {
            (uint256 bin, uint256 index) = (_id & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex();
            packedTokenBalance[_from][bin] =
                packedTokenBalance[_from][bin].updateTokenBalance(
                    index, _value, ObjectLib32.Operations.SUB
            );
            packedTokenBalance[_to][bin] =
                packedTokenBalance[_to][bin].updateTokenBalance(
                    index, _value, ObjectLib32.Operations.ADD
            );
        }

        emit TransferSingle(msg.sender == address(_sandContract) ? _from : msg.sender, _from, _to, _id, _value);
    }

    function transferFrom(address _from, address _to, uint256 _id, uint256 _value) external {
        _transferFrom(_from, _to, _id, _value);
    }
    function safeTransferFrom(address _from, address _to, uint256 _id, uint256 _value, bytes calldata _data) external {
        _transferFrom(_from, _to, _id, _value);
        require(_checkERC1155AndCallSafeTransfer(_from, _to, _id, _value, _data));
    }


    function batchTransferFrom(address _from, address _to, uint256[]calldata  _ids, uint256[] calldata _values) external {
        _batchTransferFrom(_from, _to, _ids, _values);
    }

    function safeBatchTransferFrom(address _from, address _to, uint256[] calldata _ids, uint256[] calldata _values, bytes calldata _data) external {
        _batchTransferFrom(_from, _to, _ids, _values);
        require(_checkERC1155AndCallSafeBatchTransfer(_from, _to, _ids, _values, _data));
    }

    // NOTE: call data should be optimized to order _ids so packedBalance can be used efficiently
    function _batchTransferFrom(address _from, address _to, uint256[] memory _ids, uint256[] memory _values) internal {
        require(_ids.length == _values.length, "Inconsistent array length between args");
        require(_to != address(0), "Invalid recipient");
        bool authorized = mSuperOperators[msg.sender] || operatorsForAll[_from][msg.sender] || _from == msg.sender || msg.sender == address(_sandContract); // TODO defaultOperators/superOperators

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
                (bin, index) = (_ids[i] & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex();
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
            
            // TODO (currently make auction test fails) _checkERC1155AndCallSafeTransfer(_from, _to, _ids[i], _values[i], ""); // TODO batch // TODO data
        }

        if(bin != 0 || index != 0) { // at least one MCFT
            // Update storage of the last bin visited
            packedTokenBalance[_from][bin] = balFrom;
            packedTokenBalance[_to][bin] = balTo;    
        }
        
        emit TransferBatch(msg.sender == address(_sandContract) ? _from : msg.sender, _from, _to, _ids, _values);
    }

    function balanceOf(address _owner, uint256 _id) external view returns (uint256) {
        return _balanceOf(_owner, _id);
    }

    function _balanceOf(address _owner, uint256 _id) internal view returns (uint256) {
        if(owners[_id] != address(0)) {
            if(owners[_id] == _owner) {
                return 1;
            } else {
                return 0;
            }
        }
        (uint256 bin, uint256 index) = (_id & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex();
        return packedTokenBalance[_owner][bin].getValueInBin(index);
    }

    function balanceOfBatch(address[] calldata _owners, uint256[] calldata _ids) external view returns (uint256[] memory){
        require(_owners.length == _ids.length, "Inconsistent array length between args");
        uint256[] memory balances = new uint256[](_ids.length);
        for(uint256 i = 0; i < _ids.length; i++){
            balances[i] = _balanceOf(_owners[i], _ids[i]);
        }
        return balances;
    }

    function creatorOf(uint256 _id) public view returns (address) {
        address storedCreator = creators[_id];
        if(storedCreator == address(0)) {
            return address(_id / 2**(256-160));
        }
        return storedCreator;
    }

    function supplyOf(uint256 _id) public pure returns (uint256) {
        return uint56(_id) / 2**24;
    }

    // Operators /////////////////////////////////////////////////////////////////////////////////////

    function setApprovalForAllFor(address _sender, address _operator, bool _approved) external {
        require(msg.sender == _sender || msg.sender == address(_sandContract) || mSuperOperators[msg.sender], "require meta approval");
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
        require(_owner != address(0));
        return numNFTPerAddress[_owner];
    }
    function ownerOf(uint256 _id) external view returns (address _owner){
        _owner = owners[_id];
        require(_owner != address(0));
    }
    
    function approveFor(address _sender, address _operator, uint256 _id) external {
        address owner = owners[_id];
        require(msg.sender == _sender || msg.sender == address(_sandContract) || mSuperOperators[msg.sender] || operatorsForAll[_sender][msg.sender], "require operators");
        require(owner == _sender);
        erc721_operators[_id] = _operator;
        emit Approval(owner, _operator, _id);
    }
    function approve(address _operator, uint256 _id) external {
        address owner = owners[_id];
        require(owner == msg.sender || mSuperOperators[msg.sender] || operatorsForAll[owner][msg.sender]);
        erc721_operators[_id] = _operator;
        emit Approval(owner, _operator, _id);
    }
    function getApproved(uint256 _id) external view returns (address _operator){
        require(owners[_id] != address(0));
        return erc721_operators[_id];
    }
    function transferFrom(address _from, address _to, uint256 _id) external{
        require(_to != address(0));
        require(owners[_id] == _from);
        if(msg.sender != _from && msg.sender != address(_sandContract)) {
            require(operatorsForAll[_from][msg.sender] || erc721_operators[_id] == msg.sender || mSuperOperators[msg.sender], "Operator not approved");
        }
        _transferFrom(_from, _to, _id, 1);
    }
    function safeTransferFrom(address _from, address _to, uint256 _id) external {
        safeTransferFrom(_from, _to, _id, "");
    }
    function safeTransferFrom(address _from, address _to, uint256 _id, bytes memory _data) public {
        require(_to != address(0));
        require(owners[_id] == _from);
        if(msg.sender != _from && msg.sender != address(_sandContract)) {
            require(operatorsForAll[_from][msg.sender] || erc721_operators[_id] == msg.sender || mSuperOperators[msg.sender], "Operator not approved");
        }
        _transferFrom(_from, _to, _id, 1);
        require(_checkERC721AndCallSafeTransfer(_from, _to, _id, _data));
    }
    function name() external pure returns (string memory _name) {
        return "ASSET NFT";
    }
    function symbol() external pure returns (string memory _symbol) {
        return "ASSET";
    }
    function tokenURI(uint256 _id) public view returns (string memory) {
        return string(erc721_metadataURIs[_id]);
    }
    ////////////////////////////////////////////////////////////////////////////////////////////////////

    function supportsInterface(bytes4 id)
    external
    view
    returns (bool) { // ERC1155       // ERC721           // ERC721 metadata
        return id == 0xd9b67a26 || id == 0x80ac58cd || id == 0x5b5e139f;
    }

    ///////////////////////////////////////// INTERNAL //////////////////////////////////////////////

    function _checkERC1155AndCallSafeTransfer(
        address _from,
        address _to,
        uint256 _id,
        uint256 _value,
        bytes memory _data
    )
    internal
    returns (bool)
    {
        if (!_to.isContract()) {
            return true;
        }
        bytes4 retval = ERC1155TokenReceiver(_to).onERC1155Received(
            msg.sender == address(_sandContract) ? _from : msg.sender, _from, _id, _value, _data);
        return (retval == ERC1155_RECEIVED);
    }

    // TODO tests
    function _checkERC1155AndCallSafeBatchTransfer(
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
            _from, _from, _ids, _values, _data);
        return (retval == ERC1155_RECEIVED);
    }

    function _checkERC721AndCallSafeTransfer(
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
        return (ERC721TokenReceiver(_to).onERC721Received(_from, _from, _id, _data) == ERC721_RECEIVED);
    }

    ////////////////////////////// ERC721 EXTRACTION /////////////////////////////// 

    event Extraction(uint256 indexed _fromId, uint256 _toId, string _uri); 
    
    function _burnERC1155(address _from, uint256 _id, uint256 _amount) internal {
        (uint256 bin, uint256 index) = (_id & 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF00000000FFFFFF).getTokenBinIndex();
        packedTokenBalance[_from][bin] = packedTokenBalance[_from][bin].updateTokenBalance(index, _amount, ObjectLib32.Operations.SUB);
        packedTokenBalance[address(0)][bin] = packedTokenBalance[address(0)][bin].updateTokenBalance(index, _amount, ObjectLib32.Operations.ADD);
        emit TransferSingle(msg.sender == address(_sandContract) ? _from : msg.sender, _from, address(0), _id, _amount);
    }

    function extractERC721(address _sender, uint256 _id, string calldata _uri) external {
        require(msg.sender == _sender || msg.sender == address(_sandContract) || mSuperOperators[msg.sender], "require meta approval");
        require(erc1155_metadataURIHashes[_id] != 0, "Not an ERC1155 Token");
        require(erc1155_metadataURIHashes[_id] == keccak256(abi.encodePacked(_uri)), "URI hash does not match");
        _burnERC1155(_sender, _id, 1);
        uint256 newTokenId = _mint(_uri, 1, creatorOf(_id), _sender);
        emit Extraction(_id, newTokenId, _uri);
    }
}
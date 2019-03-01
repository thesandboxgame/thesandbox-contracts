pragma solidity ^0.5.2;

import "../../Libraries/SigUtil.sol";
import "../../Libraries/PriceUtil.sol";
import "../../Sand.sol";
import "../../Interfaces/ERC20.sol";

contract ERC1155SignedAuctionExtension {

    bytes32 constant AUCTION_TYPEHASH = keccak256("Auction(address token,uint256 offerId,uint256 startingPrice,uint256 endingPrice,uint256 startedAt,uint256 duration,uint256 packs,bytes ids,bytes amounts)");

    // TODO: review event values
    event OfferClaimed(
        address indexed _seller, 
        address indexed _buyer, 
        address _token, 
        uint256 _buyAmount, 
        uint256[] _auctionData, 
        uint256[] ids, 
        uint256[] amounts, 
        bytes _signature
    ); 
    event OfferCancelled(address indexed _seller, uint256 _offerId); 

    uint256 constant MAX_SAND_AMOUNT = 1000000000000000000000000000;
    uint256 constant MAX_UINT256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff;
    // Stack too deep, grouping parameters
    // AuctionData:   
    uint256 constant AuctionData_OfferId = 0;
    uint256 constant AuctionData_StartingPrice = 1;
    uint256 constant AuctionData_EndingPrice = 2;
    uint256 constant AuctionData_StartedAt = 3;
    uint256 constant AuctionData_Duration = 4;
    uint256 constant AuctionData_Packs = 5;

    mapping (address => mapping (uint256 => uint256)) claimed;

    function claimSellerOffer(
        address buyer, 
        address payable seller, 
        address token, 
        uint256 buyAmount, 
        uint256[] calldata auctionData, 
        uint256[] calldata ids, 
        uint256[] calldata amounts, 
        bytes calldata signature
    ) external payable {
        require(msg.sender == buyer || msg.sender == address(sandContract()), "invalid buyer");

        // TODO: Not sure if required, would fail in another step if signature mismatch? This way provides an error message at least
        require(seller == recover(token, auctionData, ids, amounts, signature), "Signature mismatches");

        require(claimed[seller][auctionData[AuctionData_OfferId]] != MAX_UINT256, "Auction cancelled");
        require(canBuyAmount(seller, auctionData, buyAmount), "Buy amount exceeds sell amount");

        /// ==========================
        /// Checks for incorrect offer?
        /// ==========================
        
        // TODO: Could be optional
        require(auctionData[AuctionData_StartedAt] <= block.timestamp, "Auction didn't start yet"); 
        require(auctionData[AuctionData_StartedAt] + auctionData[AuctionData_Duration] > block.timestamp, "Auction finished"); 

        // TODO: Any of this requires would render the signature invalid (imposible to execute)
        /*require(auctionData[AuctionData_StartingPrice] < MAX_SAND_AMOUNT, "Starting price too high");
        require(auctionData[AuctionData_EndingPrice] < MAX_SAND_AMOUNT, "Ending price too high");
        require(auctionData[AuctionData_Duration] > 0, "Duration too low"); // MUST be greater than 0
        // this would be checked by the _batchTransferFrom
        require(ids.length == amounts.length, "Inconsistent array length between args amounts and ids"); // So we properly transfer assets
        require(ids.length == packAmounts.length, "Inconsistent array length between args packAmounts and ids");*/

        claimed[seller][auctionData[AuctionData_OfferId]] += buyAmount;

        uint256 offer = PriceUtil.calculateCurrentPrice(
            auctionData[AuctionData_StartingPrice], 
            auctionData[AuctionData_EndingPrice], 
            auctionData[AuctionData_Duration], 
            block.timestamp - auctionData[AuctionData_StartedAt]
        ) * buyAmount;

        if(token != address(0)) {
            ERC20(token).transferFrom(buyer, seller, offer);
        } else {
            // TODO: We could have only sand offers            
            seller.transfer(offer);    
            msg.sender.transfer(msg.value - offer);
        }

        _batchTransferFromTimes(seller, buyer, ids, amounts, buyAmount);

        emit OfferClaimed(seller, buyer, token, buyAmount, auctionData, ids, amounts, signature);
    }

    function cancelSellerOffer(uint256 offerId) external {
        claimed[msg.sender][offerId] = MAX_UINT256;

        emit OfferCancelled(msg.sender, offerId);
    }

    // Make public for testing
    function recover(address token, uint256[] memory auctionData, uint256[] memory ids, uint256[] memory amounts, bytes memory signature) internal view returns (address) {
        return SigUtil.recover(
            // This recreates the message that was signed on the client.
            keccak256(abi.encodePacked("\x19\x01", domainSeparator(), hashAuction(token, auctionData, ids, amounts))), 
            signature
        );
    }
    
    function hashAuction(address token, uint256[] memory auctionData, uint256[] memory ids, uint256[] memory amounts) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                AUCTION_TYPEHASH, 
                token, 
                auctionData[AuctionData_OfferId], 
                auctionData[AuctionData_StartingPrice], 
                auctionData[AuctionData_EndingPrice], 
                auctionData[AuctionData_StartedAt], 
                auctionData[AuctionData_Duration], 
                auctionData[AuctionData_Packs],
                keccak256(abi.encodePacked(ids)), 
                keccak256(abi.encodePacked(amounts))
            )
        );
    }     

    function canBuyAmount(address seller, uint256[] memory auctionData, uint256 buyAmount) internal view returns (bool) {
        return SafeMath.add(claimed[seller][auctionData[AuctionData_OfferId]], buyAmount) <= auctionData[AuctionData_Packs];
    }

    function sandContract() internal view returns(Sand);
    function domainSeparator() internal view returns(bytes32);
    function _batchTransferFromTimes(address _from, address _to, uint256[] memory _ids, uint256[] memory _values, uint256 _times) internal;
}
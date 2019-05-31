const BN = require('bn.js');
const { gas, encodeEventSignature } = require('./utils');

const TransferSingleEvent = encodeEventSignature('TransferSingle(address,address,address,uint256,uint256)');
const TransferBatchEvent = encodeEventSignature('TransferBatch(address,address,address,uint256[],uint256[])');
const URIEvent = encodeEventSignature('URI(string,uint256)');
const OfferClaimedEvent = encodeEventSignature('OfferClaimed(address,address,address,uint256,uint256[],uint256[],uint256[],bytes)');
const OfferCancelledEvent = encodeEventSignature('OfferCancelled(address,uint256)');
const ExtractionEvent = encodeEventSignature('Extraction(uint256,uint256,string)');

const emptyBytes = '0x';

function mint(contract, ipfsHash, supply, creator, fixedID = 0) {
  return contract.methods.mint(creator, 0, fixedID, ipfsHash, supply, creator, emptyBytes).send({ from: creator, gas });
}

async function mintAndReturnTokenId(contract, ipfsHash, supply, creator, fixedID = 0) {
  const receipt = await mint(contract, ipfsHash, supply, creator, fixedID);
  return receipt.events.TransferSingle.returnValues._id;
}

function mintMultiple(contract, uris, supplies, creator, fixedID = 0) {
  let allStrings = '';
  const numTokens = uris.length;
  const substringLengths = [];
  for (let i = 0; i < numTokens; i++) {
    const uri = uris[i];
    allStrings += uri;
    substringLengths.push(uri.length);
  }
  return contract.methods.mintMultiple(creator, 0, fixedID, allStrings, substringLengths, supplies, creator, emptyBytes).send({ from: creator, gas });
}

function mintMultipleWithNFTs(contract, uris, supplies, numNFTs, creator, fixedID = 0) {
  let allStrings = '';
  const numTokens = uris.length;
  const substringLengths = [];
  for (let i = 0; i < numTokens; i++) {
    const uri = uris[i];
    allStrings += uri;
    substringLengths.push(uri.length);
  }
  // console.log(allStrings, substringLengths, supplies, numNFTs, creator);
  return contract.methods.mintMultipleWithNFT(creator, 0, fixedID, allStrings, substringLengths, supplies, numNFTs, creator, emptyBytes).send({ from: creator, gas });
}

async function mintTokensIncludingNFTWithSameURI(contract, num, uri, supply, numNFTs, creator, fixedID = 0) {
  const uris = [];
  const supplies = [];
  for (let i = 0; i < num + numNFTs; i++) {
    uris.push(uri + '_' + i);
    if (i < num) {
      supplies.push(supply);
    }
  }
  const receipt = await mintMultipleWithNFTs(contract, uris, supplies, numNFTs, creator, fixedID);
  const eventsMatching = await getEventsMatching(contract, receipt, TransferBatchEvent);
  return eventsMatching[0].returnValues._ids;
}

async function mintTokensWithSameURIAndSupply(contract, num, uri, supply, creator, fixedID = 0) {
  const uris = [];
  const supplies = supply instanceof Array ? supply : [];
  for (let i = 0; i < num; i++) {
    uris.push(uri + '_' + i);
    if (supplies.length < num) {
      supplies.push(supply);
    }
  }
  const receipt = await mintMultiple(contract, uris, supplies, creator, fixedID);
  const eventsMatching = await getEventsMatching(contract, receipt, TransferBatchEvent);
  return eventsMatching[0].returnValues._ids;
}

async function mintMultipleAndReturnTokenIds(contract, uris, supplies, creator, fixedID = 0) {
  const receipt = await mintMultiple(contract, uris, supplies, creator, fixedID);
  const eventsMatching = await getEventsMatching(contract, receipt, TransferBatchEvent);
  return eventsMatching[0].returnValues._ids;
}

async function mintOneAtATime(contract, uris, supplies, creator, fixedID = 0) {
  const receipts = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const supply = supplies[i];
    const receipt = await contract.methods.mint(creator, 0, fixedID + i, uri, supply, creator, emptyBytes).send({ from: creator, gas });
    receipts.push(receipt);
  }
  return receipts;
}

// async function mintOneAtATimeAndReturnTokenIds(contract, uris, supplies, creator, fixedID = 0) {
//   const tokenIds = [];
//   for (let i = 0; i < uris.length; i++) {
//     const uri = uris[i];
//     const supply = supplies[i];
//     const tokenId = await mintAndReturnTokenId(contract, uri, supply, creator, fixedID + i);
//     tokenIds.push(tokenId);
//   }
//   return tokenIds;
// }

async function mintOneAtATimeAndReturnTokenIds(contract, uris, supplies, creator, fixedID = 0) {
  const receipts = await mintOneAtATime(contract, uris, supplies, creator, fixedID);
  const eventsMatching = [];
  for (const receipt of receipts) {
    const events = await getEventsMatching(contract, receipt, TransferSingleEvent);
    eventsMatching.push(events[0]);
  }
  return eventsMatching.map((event) => event.returnValues._id);
}

async function getEventsMatching(contract, receipt, sig) {
  return contract.getPastEvents(sig, {
    fromBlock: receipt.blockNumber,
    toBlock: receipt.blockNumber
  });
}

module.exports = {
  mint,
  mintAndReturnTokenId,
  mintMultiple,
  mintMultipleAndReturnTokenIds,
  mintMultipleWithNFTs,
  mintOneAtATime,
  mintTokensWithSameURIAndSupply,
  mintOneAtATimeAndReturnTokenIds,
  getEventsMatching,
  mintTokensIncludingNFTWithSameURI,
  OfferClaimedEvent,
  OfferCancelledEvent,
  ExtractionEvent,
  generateTokenId(creator, supply, fixedID=0, index=0, nftIndex = 0) {
    
    return ((new BN(creator.slice(2), 16)).mul(new BN('1000000000000000000000000', 16)))
      .add(supply == 1 ? (new BN(nftIndex)).mul(new BN('100000000000000', 16)) : new BN('800000000000000000000000', 16))
      .add(new BN(fixedID)).add(new BN(index)).toString(10)
  },
  old_generateTokenId(creator, supply, fixedID=0, index=0, nftIndex = 0) {
    
    return ((new BN(creator.slice(2), 16)).mul(new BN('1000000000000000000000000', 16)))
      .add(supply == 1 ? (new BN(nftIndex)).mul(new BN('100000000000000', 16)) : new BN('800000000000000000000000', 16).add(new BN(supply).mul(new BN('100000000000000', 16))))
      .add(new BN(fixedID)).add(new BN(index)).toString(10)
  },
};

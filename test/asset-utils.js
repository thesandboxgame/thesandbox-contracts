const { gas, encodeEventSignature } = require('./utils');

const TransferSingleEvent = encodeEventSignature('TransferSingle(address,address,address,uint256,uint256)');
const TransferBatchEvent = encodeEventSignature('TransferBatch(address,address,address,uint256[],uint256[])');
const URIEvent = encodeEventSignature('URI(string,uint256)');
const OfferClaimedEvent = encodeEventSignature('OfferClaimed(address,address,address,uint256,uint256[],uint256[],uint256[],bytes)');
const OfferCancelledEvent = encodeEventSignature('OfferCancelled(address,uint256)');
const ExtractionEvent = encodeEventSignature('Extraction(uint256,uint256,string)');

function mint(contract, ipfsHash, supply, creator) {
  return contract.methods.mint(creator, 0, ipfsHash, supply, creator).send({ from: creator, gas });
}

async function mintAndReturnTokenId(contract, ipfsHash, supply, creator) {
  const receipt = await mint(contract, ipfsHash, supply, creator);
  return receipt.events.TransferSingle.returnValues._id;
}

function mintMultiple(contract, uris, supplies, creator) {
  let allStrings = '';
  const numTokens = uris.length;
  const substringLengths = [];
  for (let i = 0; i < numTokens; i++) {
    const uri = uris[i];
    allStrings += uri;
    substringLengths.push(uri.length);
  }
  return contract.methods.mintMultiple(creator, 0, allStrings, substringLengths, supplies, creator).send({ from: creator, gas });
}

function mintMultipleWithNFTs(contract, uris, supplies, numNFTs, creator) {
  let allStrings = '';
  const numTokens = uris.length;
  const substringLengths = [];
  for (let i = 0; i < numTokens; i++) {
    const uri = uris[i];
    allStrings += uri;
    substringLengths.push(uri.length);
  }
  // console.log(allStrings, substringLengths, supplies, numNFTs, creator);
  return contract.methods.mintMultipleWithNFT(creator, 0, allStrings, substringLengths, supplies, numNFTs, creator).send({ from: creator, gas });
}

async function mintTokensIncludingNFTWithSameURI(contract, num, uri, supply, numNFTs, creator) {
  const uris = [];
  const supplies = [];
  for (let i = 0; i < num + numNFTs; i++) {
    uris.push(uri + '_' + i);
    if (i < num) {
      supplies.push(supply);
    }
  }
  const receipt = await mintMultipleWithNFTs(contract, uris, supplies, numNFTs, creator);
  const eventsMatching = await getEventsMatching(contract, receipt, TransferBatchEvent);
  return eventsMatching[0].returnValues._ids;
}

async function mintTokensWithSameURIAndSupply(contract, num, uri, supply, creator) {
  const uris = [];
  const supplies = supply instanceof Array ? supply : [];
  for (let i = 0; i < num; i++) {
    uris.push(uri + '_' + i);
    if (supplies.length < num) {
      supplies.push(supply);
    }
  }
  const receipt = await mintMultiple(contract, uris, supplies, creator);
  const eventsMatching = await getEventsMatching(contract, receipt, TransferBatchEvent);
  return eventsMatching[0].returnValues._ids;
}

async function mintMultipleAndReturnTokenIds(contract, uris, supplies, creator) {
  const receipt = await mintMultiple(contract, uris, supplies, creator);
  const eventsMatching = await getEventsMatching(contract, receipt, TransferBatchEvent);
  return eventsMatching[0].returnValues._ids;
}

async function mintOneAtATime(contract, uris, supplies, creator) {
  const receipts = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const supply = supplies[i];
    const receipt = await contract.methods.mint(creator, 0, uri, supply, creator).send({ from: creator, gas });
    receipts.push(receipt);
  }
  return receipts;
}

// async function mintOneAtATimeAndReturnTokenIds(contract, uris, supplies, creator) {
//   const tokenIds = [];
//   for (let i = 0; i < uris.length; i++) {
//     const uri = uris[i];
//     const supply = supplies[i];
//     const tokenId = await mintAndReturnTokenId(contract, uri, supply, creator);
//     tokenIds.push(tokenId);
//   }
//   return tokenIds;
// }

async function mintOneAtATimeAndReturnTokenIds(contract, uris, supplies, creator) {
  const receipts = await mintOneAtATime(contract, uris, supplies, creator);
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
  mintOneAtATime,
  mintTokensWithSameURIAndSupply,
  mintOneAtATimeAndReturnTokenIds,
  getEventsMatching,
  mintTokensIncludingNFTWithSameURI,
  OfferClaimedEvent,
  OfferCancelledEvent,
  ExtractionEvent
};

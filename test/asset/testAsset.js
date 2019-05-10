const rocketh = require('rocketh');
const {getDeployedContract, } = require('../../lib');
const {mintAndReturnTokenId} = require('../asset-utils');

const {runERC721tests} = require('../erc721_tests');
const {runDualERC1155ERC721tests} = require('../dual_erc721_erc1155_tests');
const {runERC1155tests} = require('../erc1155_tests');
const {runAssetTests} = require('./asset_tests');
const {runFixedIDAssetTests} = require('./fixed_id_tests');
const {runERC721ExtractionTests} = require('./erc721_extraction');
const {runSignedAuctionsTests} = require('./signed_auctions');


async function deployAssetAndSand() {
    await rocketh.runStages();
    return {
        Asset: getDeployedContract('Asset'),
        Sand: getDeployedContract('Sand'),
    }
}

async function deployAssetAndSandAndAuction() {
    await rocketh.runStages();
    const deployedContracts = {
        Asset: getDeployedContract('Asset'),
        Sand: getDeployedContract('Sand'),
        AssetSignedAuction: getDeployedContract('AssetSignedAuction'),
    }    
    return deployedContracts;
}

async function deployAsset() {
    await rocketh.runStages();
    return  getDeployedContract('Asset');
}

const ipfsHashString = 'ipfs://QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG';
let counter = 0;
function mint(contract, creator) {
    counter++;
    return mintAndReturnTokenId(contract, ipfsHashString, 1, creator, counter);
}
function mintDual(contract, creator, amount, ipfsS) {
    counter++;
    return mintAndReturnTokenId(contract, ipfsS || ipfsHashString, amount, creator, counter);
}
function mintWithSpecificIPFSHash(contract, ipfsHashString, amount, creator) {
    counter++;
    return mintAndReturnTokenId(contract, ipfsHashString, amount, creator, counter);
}

runERC721tests('Asset', deployAsset, mint);
runDualERC1155ERC721tests('Asset', deployAsset, mintDual);
runAssetTests('Asset', deployAssetAndSandAndAuction);
runAssetTests('Asset', deployAssetAndSandAndAuction, 101);
runFixedIDAssetTests('Asset', deployAssetAndSandAndAuction);
runERC1155tests('Asset', deployAsset, mintDual);
runERC721ExtractionTests('Asset', deployAsset)
runSignedAuctionsTests('Asset', deployAssetAndSandAndAuction);

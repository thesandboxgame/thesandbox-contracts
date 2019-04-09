const Web3 = require('web3');
const rocketh = require('rocketh');
const {
  tx,
  deployIfDifferent,
  getDeployedContract
} = require('rocketh-web3')(rocketh, Web3); 

const chainId = rocketh.chainId;

const gas = 6500000;

module.exports = async ({namedAccounts}) => {
  const {
    deployer,
    mintingFeeCollector,
    sandOwner,
  } = namedAccounts; 

  const sandContract = getDeployedContract('Sand');
  await deployIfDifferent(['data'],
    'Asset',
    {from: deployer, gas},
    'Asset',
    sandContract.options.address,
    mintingFeeCollector,
    deployer,
    chainId
  );

  const assetContract = getDeployedContract('Asset');
  await deployIfDifferent(['data'],
    'AssetSignedAuction',
    {from: deployer, gas},
    'AssetSignedAuction',
    sandContract.options.address,
    assetContract.options.address,
    chainId
  );

  const assetSignedAuctionContract = getDeployedContract('AssetSignedAuction');
  await tx({from: deployer, gas}, assetContract, "setSuperOperator", assetSignedAuctionContract.options.address, true);
  await tx({from: deployer, gas}, sandContract, "setSuperOperator", assetSignedAuctionContract.options.address, true);

  let actualSandOwner = sandOwner;
  const multiSig = getDeployedContract('MultiSig1'); // TODO use dynamic namedAccount
  if(multiSig) {
    actualSandOwner = multiSig.options.address;
  }
  await tx({from: deployer, gas}, assetContract, "changeAdmin", actualSandOwner);
}

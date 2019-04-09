const Web3 = require('web3');
const rocketh = require('rocketh');
const {
  fetchIfDifferent,
  deployIfDifferent,
  getDeployedContract,
  instantiateAndRegisterContract,
  deploy,
} = require('rocketh-web3')(rocketh, Web3); 

const chainId = rocketh.chainId;

const gas = 6000000;

module.exports = async ({namedAccounts}) => {
    
  const {
    sandOwner,
    sandBeneficiary,
    metaTransactionFundOwner,
    metaTransactionExecutor,
    deployer,
  } = namedAccounts; 

  let actualSandOwner = sandOwner;
  let actualSandbeneficiary = sandBeneficiary;

  // console.log(namedAccounts);

  if(sandOwner.type == "object") {
      const multiSigOwners = sandOwner.addresses;
      multiSigOwners.sort();
      const deployResult = await deployIfDifferent(['data'],
        'MultiSig1',
        {from: deployer, gas},
        // 'TransparentMultiSig',
        // sandBeneficiary.threshold,
        // multiSigOwners,
        // 0x0000000000000000000000000000000000000000,
        'SimpleMultiSig',
        sandBeneficiary.threshold,
        multiSigOwners,
      );
      const multiSigContract = deployResult.contract;
      actualSandOwner = multiSigContract.options.address;
      // console.log('sandOwner', multiSigContract.options.address);
  }

  if(sandBeneficiary.type == "object") {
    const multiSigOwners = sandBeneficiary.addresses;
    multiSigOwners.sort();
    const deployResult = await deployIfDifferent(['data'],
      'MultiSig1',
      {from: deployer, gas},
      // 'TransparentMultiSig',
      // sandBeneficiary.threshold,
      // multiSigOwners,
      // 0x0000000000000000000000000000000000000000,
      'SimpleMultiSig',
      sandBeneficiary.threshold,
      multiSigOwners,
    );
    const multiSigContract = deployResult.contract;
    actualSandbeneficiary = multiSigContract.options.address;
    // console.log('sandBeneficiary', multiSigContract.options.address);
  }

  const sandImplementationContractName = "Sand";

  const sandDeployResult = await deployIfDifferent(['data'],
      'SandImplementation',
      {from: deployer, gas},
      sandImplementationContractName,
      deployer,
      actualSandbeneficiary,
      chainId
  );
  const sandImplementation = sandDeployResult.contract;
  // console.log('sandImplementation', sandImplementation.options.address);
  
  let sand;
  if(chainId == 1) {
    sand = getDeployedContract('Sand');
  }

  const initData = sandImplementation.methods['initSand'](
      actualSandOwner,
      actualSandbeneficiary,
      chainId
  ).encodeABI();
  if(!sand) {
      const deployResult = await deploy(
          'SandProxy',
          {from: deployer, gas},
          'AdminUpgradeabilityProxy',
          actualSandOwner,
          sandImplementation.options.address,
          initData
      );
      const sandProxy = deployResult.contract;
      const transactionHash = deployResult.transactionHash;
      
      const events = await sandProxy.getPastEvents('AdminChanged');
      const proxyAdminAddress = events[0].returnValues[1];
      instantiateAndRegisterContract(
          'SandProxyAdmin',
          proxyAdminAddress,
          transactionHash,
          'ProxyAdmin',
          sandProxy.options.address,
          actualSandOwner
      )

      sand = instantiateAndRegisterContract(
          'Sand',
          sandProxy.options.address,
          transactionHash,
          sandImplementationContractName,
          deployer,
          actualSandbeneficiary,
          chainId
      );
  } else {
      const different = await fetchIfDifferent(['data'],
          'SandProxy',
          {from: deployer, gas},
          'AdminUpgradeabilityProxy',
          sandImplementation.options.address,
          initData
      );
      if(different) {
          console.log('TODO upgrades');
      }
  }

  // console.log('sand', sand.options.address);
  
  // const metaProxyDeployResult = await deployIfDifferent(['data'],
  //   'MetaProxy',
  //   {from: deployer, gas},
  //   'MetaProxy',
  //   metaTransactionFundOwner,
  //   sand.options.address,
  //   metaTransactionExecutor,
  //   '10000000000000000',
  //   '200000000000000000' // 20 recharge left
  // );

  // console.log('metaProxy', metaProxy.options.address);

};

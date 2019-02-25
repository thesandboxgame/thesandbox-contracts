async function deploy(web3, accounts, name, info, ...args) {
    const Contract = new web3.eth.Contract(info.abi, {data: '0x' + info.evm.bytecode.object});
    const deployment = Contract.deploy({arguments: args});
    if(!deployment) {
      console.error('cant create a deployment for contract ' + name);
      if(info.evm.bytecode.object == '') {
        console.error('byte code is empty, maybe the Contract is an abstract missing a function to implement');
      }
    }
    const contractPromise = deployment.send({from: accounts[0], gas: 6000000});
    let gasUsed;
    contractPromise.once('receipt', (receipt) => {
      gasUsed = receipt.gasUsed
    });
    const contract = await contractPromise;
    console.log('contract ' + name + ' deployed at ' + contract.options.address + ' using ' + gasUsed + ' gas');
    return contract;
}
async function deployAndRegister(web3, accounts, registerArtifact, name, info, ...args) {
    const contract = await deploy(web3, accounts, name, info, ...args);
    
    registerArtifact(name, contract, {
      contractInfo: info,
      arguments: args,
      address: contract.options.address
    });
    return contract;
}

async function deployViaProxyAndRegister(web3, accounts, registerArtifact, {name, info, proxyName, proxyInfo}, initFunction, ...args) {
  const implementationContract = await deploy(
        web3,
        accounts,
        name + '_implementation',
        info,
        ...args
    );
        
    const initData = implementationContract.methods[initFunction](...args).encodeABI();
    const proxyContract = await deployAndRegister(
        web3,
        accounts,
        registerArtifact,
        proxyName,
        proxyInfo,
        implementationContract.options.address,
        initData
    );
        
    const contract = new web3.eth.Contract(
        implementationContract.options.jsonInterface,
        proxyContract.options.address
    );
        
    registerArtifact(name, contract, {
        contractInfo: info,
        arguments: args,
        address: contract.options.address
    });

    return contract;
}

module.exports = {
    deployAndRegister,
    deployViaProxyAndRegister
}
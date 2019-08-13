const Web3 = require('web3');
const rocketh = require('rocketh');
const {
    fetchIfDifferent,
    deployIfDifferent,
    getDeployedContract,
    instantiateAndRegisterContract,
    deploy,
    tx,
    getTransactionCount,
} = require('rocketh-web3')(rocketh, Web3);

const chainId = rocketh.chainId;

const gas = 6000000;

module.exports = async ({namedAccounts, initialRun}) => {
    if (chainId == 1) { // || chainId == 4) { // || chainId === 18) { // TODO remove
        return;
    }

    function log(...args) {
        if (initialRun) {
            console.log(...args);
        }
    }
    // if(initialRun) {
    //   console.log(JSON.stringify(namedAccounts, null, '  '));
    // }

    const {
        sandAdmin,
        sandBeneficiary,
        sandUpgrader,
        metaTransactionFundOwner,
        metaTransactionExecutor,
        deployer,
    } = namedAccounts;

    const sandImplementationContractName = 'Sand';
    // const different = await fetchIfDifferent(['data'],
    //   'SandImplementation',
    //   {from: deployer, gas},
    //   sandImplementationContractName,
    //   deployer,
    //   sandBeneficiary,
    // );
    // if(different) {
    //   console.log('different');
    // }
    // process.exit(0);

    let sandDeployResult;
    try {
        sandDeployResult = await deployIfDifferent(['data'],
            'SandImplementation',
            {from: deployer, gas},
            sandImplementationContractName,
            deployer,
            sandBeneficiary,
        );
    } catch (e) {
        console.error('error deploying sand implementation', e);
    }

    const sandImplementation = sandDeployResult.contract;

    let sand;
    if (chainId == 1 || chainId == 4 || chainId == 18) {
        sand = getDeployedContract('Sand');
        log('reusing SAND', sand.options.address);
    }

    const initData = sandImplementation.methods.initSand(
        deployer,
        sandBeneficiary
    ).encodeABI();
    if (!sand) {
        log('no SAND');
        let sandProxy;
        if (chainId == 1 || chainId == 4 || chainId == 18) {
            sandProxy = getDeployedContract('SandProxy');
        }
        let transactionHash;
        if (!sandProxy) {
            log('no SAND proxy');
            let proxyDeployer = deployer;
            // const vanityNonce = await getTransactionCount('0x0f6dDcA9c25F4fAB6C0cf4d430027367b3462237'); // Vanity contract address : 0x5A3D077D05D1C7E146E0CcAfdfc91AEeeE79E32d
            // if (vanityNonce == 0 || vanityNonce == '0') {
            //     proxyDeployer = '0xf6678ef06e5a357f2367161db3dc27da6ef9d89bb380fc979f22b3df1fefabc1';
            //     await tx({from: deployer, to: '0x0f6dDcA9c25F4fAB6C0cf4d430027367b3462237', value: 100000000000000000, gas});
            // }

            let deployResult;
            try {
                deployResult = await deploy(
                    'SandProxy',
                    {from: proxyDeployer, gas: 1400000},
                    'AdminUpgradeabilityProxy',
                    sandUpgrader,
                    sandImplementation.options.address,
                    initData
                );
            } catch (e) {
                console.error('error deploying sand proxy', e);
            }

            if (initialRun) {
                console.log('gas used for Sand proxy : ' + deployResult.receipt.gasUsed);
            }
            sandProxy = deployResult.contract;
            transactionHash = deployResult.transactionHash;

            // TODO extract to make it idimpotent
            log('sandProxyAdmin...');
            const events = await sandProxy.getPastEvents('AdminChanged', {fromBlock: 0, toBlock: 'latest'}); // need to specify from and to in thundercore
            if (events.length == 0) {
                throw new Error('no event found for AdminChanged');
            }

            const proxyAdminAddress = events[0].returnValues[1];
            instantiateAndRegisterContract(
                'SandProxyAdmin',
                proxyAdminAddress,
                transactionHash,
                'ProxyAdmin',
                sandProxy.options.address,
                sandUpgrader
            );
        } else {
            const deployment = rocketh.deployment('SandProxy'); // TODO integrate that in getDeployedContract alternative
            transactionHash = deployment.transactionHash;
            log('reusing SandProxy at ' + deployment.address);
        }

        sand = instantiateAndRegisterContract(
            'Sand',
            sandProxy.options.address,
            transactionHash,
            sandImplementationContractName,
            deployer,
            sandBeneficiary
        );
    } else {
        log('reusing Sand at ' + sand.options.address + ', checking if upgrade necessary ...');
        const different = await fetchIfDifferent(['data'],
            'SandProxy',
            {from: deployer, gas},
            'AdminUpgradeabilityProxy',
            sandUpgrader,
            sandImplementation.options.address,
            initData
        );
        if (different) {
            console.log('TODO upgrade Sand', JSON.stringify({address: sandImplementation.options.address, initData}, null, '  '));
        }
    }
};

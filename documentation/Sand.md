Sand, an EIP-20 token implementation taht support meta transactions natively
===============================================================

See: [src/Sand.sol](../src/Sand.sol)

Sand smart contract is the ERC-20 token that will be used for
- Trading Assets among players
- Fee for minting Assets
- Staking in our curation / moderation system
- Paying for meta-transactions
- Voting decisions

Sand implements the ERC-20 standard
It also implement few extra mechanisms :
Approval via signature : allow the user to sign a message to approve another address to operate on its balance
AprroveAndExecute : allow the user to perform a purchase with one transaction only

It also implements the current draft of [EIP-1776](https://github.com/ethereum/EIPs/issues/1776), a proposal we put forward to standardize native meta-transactions that allow users of EOA based wallet (like metamask and most current wallets) to perform actions on ethereum without the need to own ether.

We also made the decision to make Sand upgradeable so it can support future standard or evolution of current ones. This is particularly important for EIP-1776 which is still in draft but also for [EIP-1271](http://eips.ethereum.org/EIPS/eip-1271) of which EIP-1776 depends on.

One we are confident that Sand is not going to change, we’ll remove the ability to upgrade

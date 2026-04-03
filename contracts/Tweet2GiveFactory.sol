// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./Tweet2Give.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title Tweet2GiveFactory
 * @notice Factory contract to deploy Tweet2Give instances.
 *         Allows deploying multiple instances (e.g., testnet vs mainnet,
 *         or per-chain deployments) from a single trusted factory.
 */
contract Tweet2GiveFactory is Ownable {

    struct Deployment {
        address contractAddress;
        address usdc;
        uint256 chainId;
        uint256 deployedAt;
        bool isActive;
    }

    uint256 private _deploymentCounter;
    mapping(uint256 => Deployment) public deployments;
    mapping(address => bool) public isDeployedContract;

    event ContractDeployed(
        uint256 indexed deploymentId,
        address indexed contractAddress,
        address usdc,
        uint256 chainId
    );

    error AlreadyDeployed(address contractAddress);

    constructor() Ownable(msg.sender) {}

    /**
     * @notice Deploy a new Tweet2Give instance.
     */
    function deploy(
        address usdc,
        address feeRecipient,
        uint256 initialFeeBps
    ) external onlyOwner returns (address deployedAddress, uint256 deploymentId) {
        Tweet2Give newContract = new Tweet2Give(usdc, feeRecipient, initialFeeBps);
        newContract.transferOwnership(msg.sender);

        deployedAddress = address(newContract);

        _deploymentCounter++;
        deploymentId = _deploymentCounter;

        deployments[deploymentId] = Deployment({
            contractAddress: deployedAddress,
            usdc: usdc,
            chainId: block.chainid,
            deployedAt: block.timestamp,
            isActive: true
        });

        isDeployedContract[deployedAddress] = true;

        emit ContractDeployed(deploymentId, deployedAddress, usdc, block.chainid);
    }

    /**
     * @notice Deactivate a deployment (does not affect the contract itself).
     */
    function deactivateDeployment(uint256 deploymentId) external onlyOwner {
        deployments[deploymentId].isActive = false;
    }

    function getDeploymentCount() external view returns (uint256) {
        return _deploymentCounter;
    }
}

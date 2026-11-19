// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * TESTNET REFERENCE CONTRACT ONLY. Not audited. Do not deploy for public fundraising.
 * BNB/USD quote is set manually by the owner in USD with 8 decimals, and can become stale.
 * Allocations are accounting units (18 decimals), NOT transferable TKA tokens.
 * All contributions remain escrowed until either refunds or a separately reviewed settlement.
 */
contract GenesisPresaleTestnet {
    address public immutable owner;
    uint256 public constant PRESALE_CAP = 20_000_000 ether;
    uint256 public constant TOKEN_PRICE_USD_8 = 90_000; // $0.0009, 8 decimals
    uint256 public bnbUsd8;
    uint256 public quoteUpdatedAt;
    uint256 public constant QUOTE_MAX_AGE = 1 hours;
    uint256 public totalAllocated;
    uint256 public totalContributed;
    bool public saleOpen;
    bool public refundsEnabled;
    bool private locked;
    mapping(address => uint256) public allocationOf;
    mapping(address => uint256) public contributionOf;
    event QuoteUpdated(uint256 bnbUsd8, uint256 timestamp);
    event SaleOpenChanged(bool open);
    event Contributed(address indexed buyer, uint256 bnbWei, uint256 allocationWei);
    event RefundsEnabled();
    event Refunded(address indexed buyer, uint256 bnbWei);
    modifier onlyOwner() { require(msg.sender == owner, "owner only"); _; }
    modifier nonReentrant() { require(!locked, "reentrancy"); locked = true; _; locked = false; }
    constructor() { owner = msg.sender; }
    function setQuote(uint256 priceUsd8) external onlyOwner {
        require(priceUsd8 > 0, "invalid quote");
        bnbUsd8 = priceUsd8;
        quoteUpdatedAt = block.timestamp;
        emit QuoteUpdated(priceUsd8, block.timestamp);
    }
    function setSaleOpen(bool open) external onlyOwner {
        require(!refundsEnabled, "refund mode");
        if (open) require(bnbUsd8 > 0 && block.timestamp <= quoteUpdatedAt + QUOTE_MAX_AGE, "stale quote");
        saleOpen = open;
        emit SaleOpenChanged(open);
    }
    function preview(uint256 bnbWei) public view returns (uint256) {
        require(bnbUsd8 > 0 && block.timestamp <= quoteUpdatedAt + QUOTE_MAX_AGE, "stale quote");
        return bnbWei * bnbUsd8 / TOKEN_PRICE_USD_8;
    }
    function contribute(uint256 minimumAllocationWei) external payable nonReentrant {
        require(saleOpen && !refundsEnabled, "sale closed");
        require(msg.value > 0, "zero payment");
        uint256 allocation = preview(msg.value);
        require(allocation > 0 && allocation >= minimumAllocationWei, "allocation/slippage");
        require(totalAllocated + allocation <= PRESALE_CAP, "cap reached");
        allocationOf[msg.sender] += allocation;
        contributionOf[msg.sender] += msg.value;
        totalAllocated += allocation;
        totalContributed += msg.value;
        emit Contributed(msg.sender, msg.value, allocation);
    }
    function enableRefunds() external onlyOwner {
        saleOpen = false;
        refundsEnabled = true;
        emit RefundsEnabled();
    }
    function refund() external nonReentrant {
        require(refundsEnabled, "refunds unavailable");
        uint256 amount = contributionOf[msg.sender];
        require(amount > 0, "nothing to refund");
        uint256 allocation = allocationOf[msg.sender];
        contributionOf[msg.sender] = 0;
        allocationOf[msg.sender] = 0;
        totalContributed -= amount;
        totalAllocated -= allocation;
        (bool ok,) = payable(msg.sender).call{value: amount}("");
        require(ok, "refund transfer failed");
        emit Refunded(msg.sender, amount);
    }
    // Deliberately NO owner withdrawal or token claim function in this prototype.
    // Settlement/distribution and release of escrow require a separately reviewed design.
}

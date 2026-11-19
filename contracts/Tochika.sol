// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Install OpenZeppelin Contracts v5.x. Test and obtain an independent audit before mainnet.
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

contract TochikaToken is ERC20, Ownable {
    constructor(address initialOwner) ERC20("TOCHIKA", "TKA") Ownable(initialOwner) {
        _mint(initialOwner, 100_000_000 * 10 ** decimals());
    }
}

contract TochikaSale is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    // Whole TKA tokens per 1 BNB; e.g. 1000 = 1000 TKA / BNB (both have 18 decimals).
    uint256 public tokensPerBNB;
    event Purchased(address indexed buyer, uint256 bnbPaid, uint256 tkaReceived);
    event RateUpdated(uint256 newRate);
    constructor(address token_, address owner_, uint256 rate_) Ownable(owner_) {
        require(token_ != address(0) && rate_ > 0, "Invalid config");
        token = IERC20(token_); tokensPerBNB = rate_;
    }
    function buy() external payable nonReentrant whenNotPaused {
        require(msg.value > 0, "Zero payment");
        uint256 amount = msg.value * tokensPerBNB;
        require(token.balanceOf(address(this)) >= amount, "Insufficient sale inventory");
        token.safeTransfer(msg.sender, amount);
        emit Purchased(msg.sender, msg.value, amount);
    }
    function setRate(uint256 rate_) external onlyOwner {require(rate_ > 0, "Zero rate");tokensPerBNB = rate_;emit RateUpdated(rate_);}
    function pause() external onlyOwner {_pause();}
    function unpause() external onlyOwner {_unpause();}
    function withdrawBNB(address payable to) external onlyOwner nonReentrant {require(to != address(0), "Zero address");(bool ok,) = to.call{value:address(this).balance}("");require(ok, "BNB transfer failed");}
    function withdrawUnsold(address to, uint256 amount) external onlyOwner {require(to != address(0), "Zero address");token.safeTransfer(to, amount);}
}

contract TochikaStaking is Ownable, ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;
    IERC20 public immutable token;
    struct Plan {uint256 duration;uint256 rewardBps;bool active;}
    struct Position {uint256 amount;uint256 reward;uint256 unlockTime;bool withdrawn;}
    Plan[3] public plans;
    mapping(address => Position[]) public positions;
    uint256 public totalPrincipal;
    uint256 public reservedRewards;
    event Staked(address indexed user,uint256 indexed id,uint256 amount,uint256 reward,uint256 unlockTime);
    event Withdrawn(address indexed user,uint256 indexed id,uint256 payout);
    constructor(address token_,address owner_) Ownable(owner_) {
        require(token_ != address(0), "Zero token");token=IERC20(token_);
        plans[0]=Plan(30 days,0,false);plans[1]=Plan(90 days,0,false);plans[2]=Plan(180 days,0,false);
    }
    // Set per-term reward in basis points (100 = 1% for entire term, NOT annualized).
    function configurePlan(uint8 id,uint256 rewardBps,bool active) external onlyOwner {
        require(id<3 && rewardBps<=10000,"Invalid plan");
        plans[id].rewardBps=rewardBps;plans[id].active=active;
    }
    function fundRewards(uint256 amount) external onlyOwner {token.safeTransferFrom(msg.sender,address(this),amount);}
    function stake(uint256 amount,uint8 id) external nonReentrant whenNotPaused {
        require(id<3 && plans[id].active && amount>0,"Invalid stake");
        uint256 reward=amount*plans[id].rewardBps/10000;
        token.safeTransferFrom(msg.sender,address(this),amount);
        require(token.balanceOf(address(this))>=totalPrincipal+reservedRewards+amount+reward,"Reward reserve insufficient");
        totalPrincipal+=amount;reservedRewards+=reward;
        uint256 unlock=block.timestamp+plans[id].duration;
        uint256 pos=positions[msg.sender].length;
        positions[msg.sender].push(Position(amount,reward,unlock,false));
        emit Staked(msg.sender,pos,amount,reward,unlock);
    }
    function positionCount(address user) external view returns(uint256){return positions[user].length;}
    function withdraw(uint256 id) external nonReentrant {
        Position storage p=positions[msg.sender][id];
        require(!p.withdrawn && block.timestamp>=p.unlockTime,"Position locked or withdrawn");
        p.withdrawn=true;totalPrincipal-=p.amount;reservedRewards-=p.reward;
        uint256 payout=p.amount+p.reward;token.safeTransfer(msg.sender,payout);
        emit Withdrawn(msg.sender,id,payout);
    }
    function withdrawExcess(address to,uint256 amount) external onlyOwner {
        require(to!=address(0),"Zero address");
        require(token.balanceOf(address(this))>=totalPrincipal+reservedRewards+amount,"Funds reserved");
        token.safeTransfer(to,amount);
    }
    function pause() external onlyOwner {_pause();}
    function unpause() external onlyOwner {_unpause();}
}

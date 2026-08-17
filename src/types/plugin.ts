export interface NearIntentsDepositOptions {
  /** Optional CSS class for the swap widget wrapper */
  className?: string;
  /** JWT token for fee-free swaps (get from NEAR Intents Partner Dashboard) */
  jwtToken?: string;
  /** Default slippage tolerance in basis points (default: 100 = 1%) */
  slippageTolerance?: number;
}

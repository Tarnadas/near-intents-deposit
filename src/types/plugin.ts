export interface NearIntentsDepositOptions {
  /** Optional CSS class for the swap widget wrapper */
  className?: string;
  /** JWT token for fee-free swaps (get from NEAR Intents Partner Dashboard) */
  jwtToken?: string;
  /**
   * Default slippage tolerance in basis points (100 = 1%).
   * @default 100
   * @minimum 1
   * @maximum 5000
   */
  slippageTolerance?: number;
}

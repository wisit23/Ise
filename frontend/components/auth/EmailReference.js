import styles from "./AuthLayout.module.css";

/**
 * The reference code printed in the email we just sent. Showing it here lets
 * the user pick the right message out of their inbox (an older link, or a
 * lookalike that isn't from us, won't carry this code).
 */
export default function EmailReference({ code }) {
  return (
    <span className={styles.reference}>
      Reference <strong>{code}</strong>
      <span>The email we sent shows the same code.</span>
    </span>
  );
}

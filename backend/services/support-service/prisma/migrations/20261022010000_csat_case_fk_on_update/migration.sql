-- DropForeignKey
ALTER TABLE "customer_satisfaction" DROP CONSTRAINT "customer_satisfaction_case_id_fkey";

-- AddForeignKey
ALTER TABLE "customer_satisfaction" ADD CONSTRAINT "customer_satisfaction_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "support_tickets"("ticket_id") ON DELETE CASCADE ON UPDATE CASCADE;


import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../iam/entities/tenant.entity';
import { PdfModule } from '../pdf/pdf.module';
import { CreditorProfile } from './entities/creditor-profile.entity';
import { SepaMandate } from './entities/sepa-mandate.entity';
import { SepaController } from './sepa.controller';
import { SepaPublicController } from './sepa-public.controller';
import { SepaSigningService } from './sepa-signing.service';
import { SepaService } from './sepa.service';

// SEPA direct-debit mandates for clinic owners (Panel Eiduo) — see
// SepaMandates1736500000000.
@Module({
  imports: [
    TypeOrmModule.forFeature([CreditorProfile, SepaMandate, Tenant]),
    PdfModule,
  ],
  controllers: [SepaController, SepaPublicController],
  providers: [SepaService, SepaSigningService],
})
export class SepaModule {}

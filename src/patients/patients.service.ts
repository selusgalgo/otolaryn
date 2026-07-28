import { Injectable } from '@nestjs/common';
import { TenancyContext } from '../tenancy/tenancy-context';
import { Patient } from './entities/patient.entity';

@Injectable()
export class PatientsService {
  constructor(private readonly tenancyContext: TenancyContext) {}

  findAll(): Promise<Patient[]> {
    // No explicit WHERE tenant_id here on purpose: RLS is what must filter
    // this, not application code remembering to.
    return this.tenancyContext.manager.getRepository(Patient).find();
  }

  create(name: string): Promise<Patient> {
    const repo = this.tenancyContext.manager.getRepository(Patient);
    const patient = repo.create({
      name,
      tenantId: this.tenancyContext.tenantId,
    });
    return repo.save(patient);
  }
}

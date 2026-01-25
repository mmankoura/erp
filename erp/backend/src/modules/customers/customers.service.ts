import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../entities/customer.entity';
import { CreateCustomerDto, UpdateCustomerDto } from './dto';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  AuditEntityType,
} from '../../entities/audit-event.entity';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customerRepository: Repository<Customer>,
    private readonly auditService: AuditService,
  ) {}

  async findAll(): Promise<Customer[]> {
    return this.customerRepository.find({
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({ where: { id } });
    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }
    return customer;
  }

  async create(createCustomerDto: CreateCustomerDto): Promise<Customer> {
    const customer = this.customerRepository.create(createCustomerDto);
    return this.customerRepository.save(customer);
  }

  async update(
    id: string,
    updateCustomerDto: UpdateCustomerDto,
  ): Promise<Customer> {
    const customer = await this.findOne(id);
    Object.assign(customer, updateCustomerDto);
    return this.customerRepository.save(customer);
  }

  async remove(id: string, actor?: string): Promise<void> {
    const customer = await this.findOne(id);
    await this.customerRepository.softRemove(customer);

    // Emit audit event
    await this.auditService.emitDelete(
      AuditEventType.CUSTOMER_DELETED,
      AuditEntityType.CUSTOMER,
      id,
      {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
      },
      actor,
    );
  }

  async restore(id: string): Promise<Customer> {
    const customer = await this.customerRepository.findOne({
      where: { id },
      withDeleted: true,
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID "${id}" not found`);
    }

    if (!customer.deleted_at) {
      throw new ConflictException(`Customer with ID "${id}" is not deleted`);
    }

    await this.customerRepository.restore(id);
    return this.findOne(id);
  }

  async findAllIncludingDeleted(): Promise<Customer[]> {
    return this.customerRepository.find({
      withDeleted: true,
      order: { name: 'ASC' },
    });
  }

  async search(query: string): Promise<Customer[]> {
    return this.customerRepository
      .createQueryBuilder('customer')
      .where('customer.name ILIKE :query', { query: `%${query}%` })
      .orWhere('customer.email ILIKE :query', { query: `%${query}%` })
      .orderBy('customer.name', 'ASC')
      .getMany();
  }
}

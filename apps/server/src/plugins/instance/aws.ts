import { type HashType } from "@repo/api";
import { InstanceAPI } from "./instance";
import * as AWS from "aws-sdk";

export interface AWSInstanceAPIConfig {
    imageId: string;
}

export class AWSInstanceAPI extends InstanceAPI<AWSInstanceAPIConfig> {
    private ec2!: AWS.EC2;

    private loadCredentials(): Promise<boolean> {
        return new Promise(async (resolve) => AWS.config.getCredentials((err) => {
            if (err) resolve(false);
            else resolve(true);
        }));
    }

    public async load(): Promise<boolean> {
        if (!this.loadCredentials()) return false;

        this.ec2 = new AWS.EC2();

        return true;
    }

    public async create(_hashType: HashType, _hashes: string[], instanceType?: string): Promise<string | null> {
        try {
            const res = await this.ec2.runInstances({
                ImageId: this.config.imageId,
                InstanceType: instanceType ?? "t2.micro",
                MinCount: 1,
                MaxCount: 1,
            }).promise();
    
            const instanceId = res.Instances?.[0]?.InstanceId;
            if (!instanceId) return null;
    
            return instanceId;
        } catch(e) {
            return null;
        }
    }

    public async start(instanceId: string): Promise<boolean> {
        try {
            await this.ec2.startInstances({
                InstanceIds: [instanceId]
            }).promise();

            return true;
        } catch(e) {
            return false;
        }
    }

    public async stop(instanceId: string): Promise<boolean> {
        try {
            await this.ec2.stopInstances({
                InstanceIds: [instanceId]
            }).promise();

            return true;
        } catch(e) {
            return false;
        }
    }

    public async terminate(instanceId: string): Promise<boolean> {
        try {
            await this.ec2.terminateInstances({
                InstanceIds: [instanceId]
            }).promise();

            return true;
        } catch(e) {
            return false;
        }
    }
}

// This is for the GPU ec2 instances that get created to process jobs
import { DockerImage, Duration } from "aws-cdk-lib";
import {
  ISubnet,
  IVpc,
  MachineImage,
  Port,
  SecurityGroup,
} from "aws-cdk-lib/aws-ec2";
import { IFileSystem } from "aws-cdk-lib/aws-efs";
import {
  InstanceProfile,
  ManagedPolicy,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import { Asset } from "aws-cdk-lib/aws-s3-assets";
import {
  DefinitionBody,
  JsonPath,
  StateMachine,
} from "aws-cdk-lib/aws-stepfunctions";
import { CallAwsService } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import path from "path";

import { envInstanceConfig } from "@repo/app-config/instance";

export interface InstanceStackConfig {
  interval?: number;
  cooldown?: number;
  sshKey?: string;
  imageId?: string;
}

export interface InstanceStackProps extends InstanceStackConfig {
  accessPointId?: string;
  prefix?: string;
  vpc: IVpc;
  subnets: ISubnet[]; // Changed from subnet to subnets array for multi-AZ support
  fileSystem: IFileSystem;
  fileSystemPath: string;
  securityGroup?: SecurityGroup; // Optional: security group for GPU instances
}

interface UserDataTemplateProps {
  s3ObjectUrl: string;
  hashcatPath: string;
  fileSystemId: string;
  fileSystemPath: string;
  instanceEnvString: string;
  scriptPath: string;
  accessPointId?: string;
}

export class InstanceStack extends Construct {
  public readonly stepFunction: StateMachine;
  public readonly instanceRole: Role;
  public readonly instanceSG: SecurityGroup;
  public readonly asset: Asset;
  // jobQueue removed - SQS is no longer used

  public static readonly NAME = "instance";

  constructor(scope: Construct, props: InstanceStackProps) {
    const id = `${InstanceStack.NAME}-stack`;
    super(scope, id);

    const prefix =
      props.prefix !== undefined ? `${props.prefix}-${id}` : undefined;
    const tag = (v: string) =>
      prefix !== undefined ? `${prefix}-${v}` : undefined;

    // SQS queue removed - instances will use EFS scanning instead

    // Use provided security group or create a new one
    this.instanceSG =
      props.securityGroup ??
      new SecurityGroup(this, "security-group", {
        securityGroupName: tag("security-group"),
        vpc: props.vpc,
        description: "Security group for GPU instances",
      });

    if (props.sshKey) {
      this.instanceSG.connections.allowFromAnyIpv4(
        Port.SSH,
        "SSH for debugging"
      );
    }

    // Allow GPU instances to access EFS
    props.fileSystem.connections.allowDefaultPortFrom(this.instanceSG);

    // GPU Instance Role - LEAST PRIVILEGE (no EC2 management permissions)
    this.instanceRole = new Role(this, "role", {
      roleName: tag("role"),
      assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
      description: "IAM role for GPU instances - least privilege access",
    });

    // Remove AmazonEC2FullAccess - CRITICAL SECURITY FIX
    // GPU instances should NOT be able to create/modify/delete EC2 resources

    // Allow EFS access for reading wordlists and writing results
    this.instanceRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "AmazonElasticFileSystemClientReadWriteAccess"
      )
    );

    props.fileSystem.grantReadWrite(this.instanceRole);

    // Previously granted SQS permissions; removed since queue no longer exists

    this.asset = new Asset(this, "package", {
      path: __dirname,
      bundling: {
        image: DockerImage.fromBuild(path.join(__dirname, "..", "..", ".."), {
          file: path.join(
            "packages",
            "container",
            InstanceStack.NAME,
            "aws",
            "Containerfile"
          ),
        }),
      },
    });

    this.asset.grantRead(this.instanceRole);

    // Rainbow (NetNTLMv1 / hashcat 5500) instances stage the GRTB table set
    // from S3 onto local NVMe at boot. Grant read-only access to that one
    // bucket/prefix. GPU instances never touch it, but the role is shared, so
    // the grant is harmless there. Scoped to Get/List on the bucket + prefix.
    this.instanceRole.addToPolicy(
      new PolicyStatement({
        actions: ["s3:GetObject", "s3:ListBucket"],
        resources: [
          "arn:aws:s3:::rainbow-mvp-975050138772",
          "arn:aws:s3:::rainbow-mvp-975050138772/mvp/grtb/*",
        ],
      })
    );

    const instanceProfile = new InstanceProfile(this, "profile", {
      role: this.instanceRole,
    });

    // Helper function to create runInstance task for a specific subnet
    const createRunInstanceTask = (subnetIndex: number) => {
      const subnet = props.subnets[subnetIndex];
      if (!subnet) {
        throw new Error(`Subnet at index ${subnetIndex} is undefined`);
      }

      return new CallAwsService(this, `run-instance-az-${subnetIndex}`, {
        service: "ec2",
        action: "runInstances",
        parameters: {
          ImageId:
            props.imageId ??
            MachineImage.latestAmazonLinux2023().getImage(this).imageId,
          InstanceType: JsonPath.stringAt("$.instanceType"),
          MinCount: 1,
          MaxCount: 1,
          KeyName: props.sshKey,
          IamInstanceProfile: {
            Arn: instanceProfile.instanceProfileArn,
          },
          UserData: JsonPath.base64Encode(
            JsonPath.format(
              this.getUserDataTemplate(props),
              JsonPath.stringAt("$.instanceID"),
              JsonPath.stringAt("$.instanceType")
            )
          ),
          EbsOptimized: false,
          BlockDeviceMappings: [
            {
              DeviceName: "/dev/xvda",
              Ebs: {
                VolumeType: "gp2",
                VolumeSize: 16,
                DeleteOnTermination: true,
                Encrypted: true,
              },
            },
          ],
          NetworkInterfaces: [
            {
              SubnetId: subnet.subnetId,
              AssociatePublicIpAddress: false,
              DeviceIndex: 0,
              Groups: [this.instanceSG.securityGroupId],
            },
          ],
          PrivateDnsNameOptions: {
            HostnameType: "ip-name",
            EnableResourceNameDnsARecord: false,
            EnableResourceNameDnsAAAARecord: false,
          },
          TagSpecifications: [
            {
              ResourceType: "instance",
              Tags: [
                {
                  Key: "Name",
                  Value: JsonPath.format(
                    tag("{}") ?? "{}",
                    JsonPath.stringAt("$.instanceID")
                  ),
                },
                {
                  Key: "ManagedBy",
                  Value: "Crackosaurus",
                },
                {
                  // Explicit instanceID → EC2 mapping so the server reaper can
                  // match a live box to its DB/EFS instance exactly, without
                  // parsing it out of the Name tag.
                  Key: "InstanceID",
                  Value: JsonPath.stringAt("$.instanceID"),
                },
                {
                  Key: "Type",
                  Value: "GPU", // Required for terminate permission condition
                },
                {
                  Key: "AvailabilityZone",
                  Value: subnet.availabilityZone,
                },
              ],
            },
          ],
        },
        iamResources: ["*"],
      });
    };

    // Capacity/throttle errors are transient — a type briefly unavailable in an
    // AZ often frees up within seconds. Retry IN-AZ a couple times with backoff
    // BEFORE escalating to the cross-AZ fallback below, so short capacity blips
    // are absorbed silently inside the state machine (the common case) without
    // bouncing through the app-side park-and-retry loop. This RETRY is scoped to
    // capacity / rate-limit codes only, so a genuine misconfig (bad AMI, IAM)
    // gets NO in-AZ retries — it drops straight to the cross-AZ catch below.
    // (The catch is broader; see its comment for the misconfig behaviour.)
    // Step Functions surfaces EC2 CallAwsService errors as `Ec2.<Code>`. The
    // modern EC2 API returns the BARE code (Ec2.RequestLimitExceeded), while
    // some paths still emit the legacy `.Client.`-prefixed form — so list BOTH
    // spellings for each code. Omitting the bare RequestLimitExceeded (as an
    // earlier version did) left the throttle retry dead, since ErrorEquals is
    // an EXACT match, not a substring match.
    // NOTE on Ec2.Ec2Exception: the generic aws-sdk integration surfaces an
    // insufficient-capacity failure under this generic wrapper code (the
    // specific InsufficientInstanceCapacity is only in the message), so it is
    // listed here to get the in-AZ capacity retry. Trade-off: this code ALSO
    // covers genuine misconfigs (bad AMI, IAM), so those now get the 2 in-AZ
    // retries too (~40s wasted) before failing over — accepted so real capacity
    // blips are absorbed in-AZ. ErrorEquals is an EXACT match (not substring),
    // which is why each code is listed verbatim in both spellings.
    const CAPACITY_RETRY_ERRORS = [
      "Ec2.InsufficientInstanceCapacity",
      "Ec2.Client.InsufficientInstanceCapacity",
      "Ec2.RequestLimitExceeded",
      "Ec2.Client.RequestLimitExceeded",
      "Ec2.Ec2Exception",
    ];
    const addCapacityRetry = (task: CallAwsService) =>
      task.addRetry({
        errors: CAPACITY_RETRY_ERRORS,
        interval: Duration.seconds(20),
        maxAttempts: 2,
        backoffRate: 2,
      });

    // Create primary runInstance task (first AZ)
    const runInstance = createRunInstanceTask(0);
    addCapacityRetry(runInstance);

    // Chain a cross-AZ fallback for every remaining subnet: AZ0 → AZ1 → AZ2 …
    // Each task gets the in-AZ capacity retry; each non-final task CATCHES to
    // the next AZ. Catchers run only AFTER the in-AZ retries are exhausted.
    //
    // The catch is deliberately BROAD (States.TaskFailed catches any task
    // failure, not only capacity) so a transient blip — including the
    // Ec2.Ec2Exception the SDK integration emits for an insufficient-capacity
    // failure — still fails over to the next AZ. Cost of the breadth: a genuine
    // misconfig (bad AMI, IAM) fails in every AZ in turn before the last one
    // fails for real — a few wasted seconds per AZ, not a wasted instance.
    //
    // resultPath:"$.error" merges the failure under $.error while PRESERVING
    // the input (instanceID/instanceType), so the next AZ's task still has them.
    //
    // The FINAL task is intentionally left uncaught: if the last AZ also fails
    // the execution FAILS, and the server-driven reconciler picks it up to
    // park-and-retry in-region on capacity codes (fail-closed classify), or
    // terminally error after N attempts on anything else.
    let previousTask = runInstance;
    for (let i = 1; i < props.subnets.length; i++) {
      const fallback = createRunInstanceTask(i);
      addCapacityRetry(fallback);
      previousTask.addCatch(fallback, {
        errors: [
          "States.TaskFailed", // Generic task failure (broad — see comment above)
          "Ec2.InsufficientInstanceCapacity", // Specific capacity error
          "Ec2.Client.InsufficientInstanceCapacity",
        ],
        resultPath: "$.error",
      });
      previousTask = fallback;
    }

    this.stepFunction = new StateMachine(this, "state-machine", {
      stateMachineName: tag("run-instance"),
      definitionBody: DefinitionBody.fromChainable(runInstance),
    });

    this.stepFunction.node.addDependency(props.fileSystem);

    this.stepFunction.addToRolePolicy(
      new PolicyStatement({
        actions: ["ec2:*"],
        resources: ["*"],
      })
    );

    this.instanceRole.grantPassRole(this.stepFunction.role);
  }

  protected getUserDataTemplate(props: InstanceStackProps): string {
    const scriptPath = "/app/index.js";
    const hashcatPath = "/app/hashcat/hashcat.bin";

    const formatTag = "{}";

    const instanceEnv = envInstanceConfig({
      instanceID: formatTag,
      instanceType: formatTag,
      hashcatPath: hashcatPath,
      instanceRoot: path.posix.join("/mnt/efs/crackodata", "instances"),
      wordlistRoot: path.posix.join("/mnt/efs/crackodata", "wordlists"),
      ruleRoot: path.posix.join("/mnt/efs/crackodata", "rules"),
      instanceCooldown: props.cooldown ?? 60,
      instanceInterval: props.interval ?? 10,
      // SQS queue URL removed - not included in instance env
    });

    const instanceEnvString = Object.entries(instanceEnv)
      .map(
        ([key, value]) =>
          `${key}=${value === formatTag ? formatTag : JSON.stringify(value)}`
      )
      .join(" ");

    const templateProps: UserDataTemplateProps = {
      s3ObjectUrl: this.asset.s3ObjectUrl,
      hashcatPath,
      fileSystemId: props.fileSystem.fileSystemId,
      fileSystemPath: props.fileSystemPath,
      instanceEnvString,
      scriptPath,
      accessPointId: props.accessPointId,
    };

    return this.getUserDataTemplateAmazonLinux(templateProps);
  }

  protected getUserDataTemplateAmazonLinux(
    props: UserDataTemplateProps
  ): string {
    return `#!/bin/bash

    # Instance Info
    TOKEN=$(curl -s --request PUT "http://169.254.169.254/latest/api/token" --header "X-aws-ec2-metadata-token-ttl-seconds: 3600")
    EC2_INSTANCE_ID=$(curl -s http://169.254.169.254/latest/meta-data/instance-id --header "X-aws-ec2-metadata-token: $TOKEN")
    AWS_REGION=$(curl -s http://169.254.169.254/latest/meta-data/placement/region --header "X-aws-ec2-metadata-token: $TOKEN")

    # Install minimal packages needed for EFS mount
    echo "=== Installing EFS utilities ===" | tee -a /var/log/userdata.log
    yum update -y
    yum install -y aws-cli amazon-efs-utils nfs-utils

    # Mount EFS EARLY - before heavy driver installs
    echo "=== Mounting EFS ===" | tee -a /var/log/userdata.log
    mkdir -p /mnt/efs/crackodata
    echo "Attempting to mount EFS: ${props.fileSystemId}:/ -> /mnt/efs/crackodata" | tee -a /var/log/userdata.log
    echo "Access Point: ${props.accessPointId}" | tee -a /var/log/userdata.log
    
    # When using access point, mount root (/) not the path - access point enforces the path
    if mount -t efs -o tls,iam,accesspoint=${props.accessPointId} ${props.fileSystemId}:/ /mnt/efs/crackodata; then
        echo "✓ EFS mount successful" | tee -a /var/log/userdata.log
        echo "Instance folders on EFS: $(ls /mnt/efs/crackodata/instances/ 2>/dev/null | wc -l)" | tee -a /var/log/userdata.log
        ls -la /mnt/efs/crackodata/ | tee -a /var/log/userdata.log
        mount | grep efs | tee -a /var/log/userdata.log
    else
        echo "✗ EFS mount FAILED with exit code $?" | tee -a /var/log/userdata.log
        echo "Checking EFS utils..." | tee -a /var/log/userdata.log
        which mount.efs | tee -a /var/log/userdata.log
        echo "Network connectivity check..." | tee -a /var/log/userdata.log
        ping -c 3 ${props.fileSystemId}.efs.$AWS_REGION.amazonaws.com | tee -a /var/log/userdata.log
        echo "Continuing without EFS mount - instance will fail" | tee -a /var/log/userdata.log
    fi

    echo "Continuing with driver/table setup..." | tee -a /var/log/userdata.log

    # Branch GPU-vs-rainbow at runtime on the actual instance type. The Step
    # Function pins i3en.* for NetNTLMv1 (5500) rainbow jobs; every other type
    # is a GPU hashcat box. We keep ONE user-data template and switch here so
    # CDK stays type-agnostic.
    INSTANCE_TYPE=$(curl -s http://169.254.169.254/latest/meta-data/instance-type --header "X-aws-ec2-metadata-token: $TOKEN")
    echo "Instance type: $INSTANCE_TYPE" | tee -a /var/log/userdata.log

    RAINBOW_MODE=0
    case "$INSTANCE_TYPE" in
      i3en.*|i3.*) RAINBOW_MODE=1 ;;
    esac

    if [ "$RAINBOW_MODE" = "1" ]; then
        # ── Rainbow box: no GPU. Stage GRTB tables onto local NVMe, install
        #    ntlmrain, and export RAINBOW_DATA_ROOT so the worker takes the
        #    CPU rainbow-lookup path instead of hashcat. ──
        echo "=== Rainbow instance: skipping CUDA, staging GRTB tables ===" | tee -a /var/log/userdata.log
        dnf install -y nvme-cli unzip

        # Detect the instance-store NVMe (model "Amazon EC2 NVMe Instance
        # Storage") — distinct from the EBS root volume. Format + mount it as
        # scratch for the ~3.99 TB table set.
        # NOTE: this whole string is a States.Format template where a literal
        # brace pair is a substitution placeholder, so this shell command must
        # contain NO braces at all. Use grep+sed (not awk) to grab field 1.
        INSTANCE_STORE=$(nvme list 2>/dev/null | grep 'Instance Storage' | head -n1 | sed 's/[[:space:]].*//')
        mkdir -p /mnt/rainbow
        if [ -n "$INSTANCE_STORE" ]; then
            echo "Instance-store NVMe: $INSTANCE_STORE" | tee -a /var/log/userdata.log
            mkfs.xfs -f "$INSTANCE_STORE" | tee -a /var/log/userdata.log
            mount "$INSTANCE_STORE" /mnt/rainbow
        else
            echo "WARN: no instance-store NVMe found; staging tables on root disk" | tee -a /var/log/userdata.log
        fi
        mkdir -p /mnt/rainbow/tables

        # Tune the AWS CLI S3 transfer for the ~4 TB cold pull. The default
        # (10 concurrent, non-CRT) tops out near 3 Gbps and takes ~3 hr; the
        # CRT client with high concurrency saturates the i3en 25 Gbps NIC and
        # stages in ~20-30 min. Both knobs are set so whichever client the CLI
        # picks is tuned. NOTE: States.Format template — no literal braces here.
        aws configure set default.s3.preferred_transfer_client crt
        aws configure set default.s3.target_bandwidth 25Gb/s
        aws configure set default.s3.max_concurrent_requests 40
        aws configure set default.s3.max_queue_size 10000

        # Cold-load GRTB shards + index from S3 (one-time per boot).
        echo "Staging GRTB tables from S3 (this takes a while)..." | tee -a /var/log/userdata.log
        aws s3 cp --recursive --only-show-errors s3://rainbow-mvp-975050138772/mvp/grtb/ /mnt/rainbow/tables/ 2>&1 | tail -5 | tee -a /var/log/userdata.log
        echo "GRTB files staged: $(ls /mnt/rainbow/tables/ | wc -l)" | tee -a /var/log/userdata.log

        # Install ntlmrain (pinned release).
        curl -fsSL -o /tmp/ntlmrain.zip https://github.com/outflanknl/ntlmrain/releases/download/v0.1.18/ntlmrain-linux-x86_64.zip
        unzip -o /tmp/ntlmrain.zip -d /usr/local/bin/ | tee -a /var/log/userdata.log
        chmod a+x /usr/local/bin/ntlmrain
        rm -f /tmp/ntlmrain.zip

        # Worker runs as uid 1001 — make tables + binary readable (metadata-only chmod).
        chmod -R a+rX /mnt/rainbow

        # Worker inherits these by sourcing /etc/rainbow.env in its launch line.
        cat > /etc/rainbow.env <<'RBENV'
export RAINBOW_DATA_ROOT=/mnt/rainbow/tables
export RAINBOW_NTLMRAIN_BIN=/usr/local/bin/ntlmrain
RBENV
    else
        # ── GPU box: install NVIDIA driver + CUDA toolkit for hashcat. ──
        echo "=== GPU instance: installing CUDA drivers ===" | tee -a /var/log/userdata.log
        dnf config-manager --add-repo https://developer.download.nvidia.com/compute/cuda/repos/amzn2023/x86_64/cuda-amzn2023.repo
        dnf clean expire-cache
        dnf update -y
        dnf install -y kernel-devel kernel-modules-extra
        dnf module install -y nvidia-driver:latest-dkms
        dnf install -y cuda-toolkit
    fi

    # Install Node
    curl -fsSL -o- https://rpm.nodesource.com/setup_20.x | bash
    dnf install nodejs -y

    # Create worker user with same UID/GID as cluster container (1001:1001)
    groupadd -g 1001 worker || true
    useradd -u 1001 -g 1001 -m worker || true
    
    # Ensure top-level EFS directories exist and are owned by worker.
    # IMPORTANT: Do NOT recursively chown the entire instances/ tree — with
    # thousands of stale folders this takes forever on EFS. The access point
    # already enforces uid/gid 1001:1001 for new files. Only chown the
    # top-level dirs and this instance's own folder.
  mkdir -p /mnt/efs/crackodata/instances /mnt/efs/crackodata/wordlists /mnt/efs/crackodata/rules
  chown 1001:1001 /mnt/efs/crackodata/instances /mnt/efs/crackodata/wordlists /mnt/efs/crackodata/rules

    # Install App
    aws s3 cp ${props.s3ObjectUrl} /tmp/package.zip
    unzip /tmp/package.zip -d /
    rm -f /tmp/package.zip
    
    # Install aws-sdk in app directory
    cd /app
    npm init -y
    npm install aws-sdk
    
    chown 1001:1001 -R /app
    chmod a+x ${props.hashcatPath}

    # Run App (output to both console and log file)
    echo "=== Starting Instance Application ==="
  # Use the generated instance env string which includes RULE_ROOT when present.
  # Rainbow boxes wrote /etc/rainbow.env (RAINBOW_DATA_ROOT etc); source it so
  # the worker inherits it and takes the CPU rainbow path. On GPU boxes the file
  # is absent and the source is a no-op.
  su worker -c 'source /etc/rainbow.env 2>/dev/null; ${props.instanceEnvString} node ${props.scriptPath} 2>&1 | tee /tmp/session.log'
    echo "=== Instance Application Exited with code: $? ==="

    # Stop Instance
    aws ec2 terminate-instances --instance-ids $EC2_INSTANCE_ID
    `;
  }
}

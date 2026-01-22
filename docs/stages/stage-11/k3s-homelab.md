# Building a Homelab with k3s

- The goal is simple 
    - we get two machine
    - we ensure they can talk to each other
    - we install k3s on one and k3s agent on the other, 
    - we run our cluster resources there
    - we expose the portal through metalLB service 
    - and then expose to the world using cloudflare tunnel or ssh remote port forwarding.


**Here are my machines:**

> yours could differ [not a problem, commands will largly be the same except the firewall ones]

* **Fedora** → Control Plane (server)
* **Manjaro** → Worker (agent)

# Initial Setup

## 0. Prerequisites (VERY IMPORTANT)

### Decide IPs (static)

- You **must** use static IPs for this machine. 
- The simplest way to do this is from the network settings on desktop. Else you can use `nmcli` to do the same. 
- **Ensure that the ip is not in use by any other machine**. I purposely selected a ip further up in my subnet range `192.168.1.0/24` to avoid any conflicts. 
- Check that the ip remains the same after restart. 

Example:

* Fedora (control plane): `192.168.1.199`
* Manjaro (worker): `192.168.1.200`

Confirm:

```bash
ip a
ip route
```

From **each machine**, ensure they can ping each other:

```bash
ping 192.168.1.199
ping 192.168.1.200
```

---

### Disable the firwalls firewalld / ufw 

(for now) You can re-enable later once cluster works.

#### Fedora

```bash
sudo systemctl disable --now firewalld
```

#### Manjaro

```bash
sudo systemctl disable --now ufw
```

---

### Disable swap (mandatory)

> Why is this necessary? [read here](https://notes.darshanraul.cloud/kubernetes/concepts/need-for-swapoff)

#### Fedora + Manjaro

```bash
sudo swapoff -a
sudo sed -i '/swap/d' /etc/fstab
```

Verify:

```bash
free -h
```

---

### Enable required kernel modules

#### Fedora + Manjaro

```bash
sudo modprobe br_netfilter
sudo modprobe overlay
```

Persist:

```bash
cat <<EOF | sudo tee /etc/modules-load.d/k8s.conf
br_netfilter
overlay
EOF
```

Sysctl:

```bash
cat <<EOF | sudo tee /etc/sysctl.d/k8s.conf
net.bridge.bridge-nf-call-iptables=1
net.ipv4.ip_forward=1
net.bridge.bridge-nf-call-ip6tables=1
EOF

sudo sysctl --system
```

---

## 1. Install K3s on Fedora (Control Plane)

On **Fedora**:

```bash
curl -sfL https://get.k3s.io | \
INSTALL_K3S_EXEC="server \
  --node-ip=192.168.1.199 \
  --tls-san=192.168.1.199 \
  --write-kubeconfig-mode=644" \
sh -
```

### Verify service

```bash
sudo systemctl status k3s
```

### Verify cluster

```bash
kubectl get nodes
```

Expected:

```
NAME        STATUS   ROLES                  AGE   VERSION
fedora      Ready    control-plane,master   XXs   v1.xx.x+k3s
```

---

## 2. Get the Join Token (VERY IMPORTANT)

On **Fedora**:

```bash
sudo cat /var/lib/rancher/k3s/server/node-token
```

Copy it somewhere safe.
You’ll need it on Manjaro.

---

## 3. Install K3s on Manjaro (Worker Node)

On **Manjaro**:

```bash
curl -sfL https://get.k3s.io | \
K3S_URL=https://192.168.1.199:6443 \
K3S_TOKEN=<PASTE_TOKEN_HERE> \
INSTALL_K3S_EXEC="agent --node-ip=192.168.1.200" \
sh -
```

### Verify agent service

```bash
sudo systemctl status k3s-agent
```

---

## 4. Verify the Cluster (From Fedora)

```bash
kubectl get nodes -o wide
```

Expected:

```
NAME       STATUS   ROLES                  INTERNAL-IP
fedora     Ready    control-plane,master   192.168.1.199
manjaro    Ready    <none>                 192.168.1.200
```

🎉 **Your 2-node K3s cluster is LIVE**

---

## 5. Test with a Real Workload

### Deploy NGINX

```bash
kubectl create deployment nginx --image=nginx
kubectl expose deployment nginx --port=80 --type=NodePort
```

Check:

```bash
kubectl get svc nginx
```

Example output:

```
NodePort: 80:31234/TCP
```

Access from browser:

```
http://192.168.1.199:31234
http://192.168.1.200:31234
```

---

## 6. (Optional but Recommended) Set kubectl on Fedora Cleanly

K3s already installs kubectl, but to persist config:

```bash
mkdir -p ~/.kube
sudo cp /etc/rancher/k3s/k3s.yaml ~/.kube/config
sudo chown $USER:$USER ~/.kube/config
```

---

## 7. Common Pitfalls (Read This Once)

| Problem                         | Cause                          |
| ------------------------------- | ------------------------------ |
| Worker not joining              | Wrong token or wrong server IP |
| Node shows NotReady             | Firewall / CNI blocked         |
| Can’t access NodePort           | Firewall still enabled         |
| Pods stuck in ContainerCreating | br_netfilter not enabled       |

## 8. Creating our resources in it


# Metallb setup
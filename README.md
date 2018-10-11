# webrtc-perception - v0.0.0

`webrtc-perception` can be though of as a "metapackage" which includes several, work-in-progress code bundles that seek to leverage WebRTC to facilitate computational photography, photogrammetry, and modeling tasks. This project is under heavy development, and things will change and break at irregular intervals (as the developers' time is split between this and other active projects in the lab). ***For now, your mileage may vary!***

## Architecture

A quick overview of what we are shooting for with some of these technologies is included below.

![](https://github.com/spieswl/webrtc-perception/blob/master/docs/webrtc-perception_block_diagram.png)

## Installation and Use

First, ensure you have the latest LTS version of **[NodeJS](https://nodejs.org/en/download/)** installed (with **npm**). We have been running with `node-v10.12.0` internally, but the LTS version should work at this early milestone.

Second, you will need to have your own SSL certificate handy, as WebRTC's `getUserMedia()` was [deprecated for unsecure origins in late 2015](https://sites.google.com/a/chromium.org/dev/Home/chromium-security/deprecating-powerful-features-on-insecure-origins). Luckily, tutorials for creating SSL/TLS certificates [abound](https://stackoverflow.com/questions/10175812/how-to-create-a-self-signed-certificate-with-openssl).

### Installation

1. Clone this respository.
2. Add a folder named "certs" to the root of the cloned repository and move your SSL certificate and private key inside.
3. Execute `npm install --save` in the root of the cloned repository.

***Note that, for step 2, you may need to rename the entries in server.js to match your certificate and key file names.***

### Usage

1. Execute `sudo node server.js` in the root of the cloned repository.
2. Navigate a WebRTC-compliant browser to the IP address which is currently being served content by the now-active`nodeJS` instance.

## Acknowledgements

* This project is led by [William Spies](https://spieswl.github.io/) (MS Robotics, Northwestern University) and [Kai Yeh](https://github.com/kaiyeh0913) (PhD Computer Science, Northwestern University) with the assistance of Dr. Florian Willomitzer, Dr. Oliver Cossairt, and others from the [Computational Photography Lab](http://compphotolab.northwestern.edu/) at Northwestern University.

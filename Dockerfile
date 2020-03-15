FROM columbustech/mern-base

WORKDIR /
RUN wget https://dl.google.com/go/go1.13.8.linux-amd64.tar.gz
RUN tar -C /usr/local -xzf go1.13.8.linux-amd64.tar.gz

WORKDIR /go/container-manager
COPY container-manager/container-manager .
COPY container-manager/src/ .

ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH
ENV GO111MODULE on

WORKDIR /api
COPY api/package.json .
COPY api/package-lock.json .
COPY api/src/ ./src/
RUN npm install

RUN npm install pm2 -g

WORKDIR /ui
COPY ui/package.json .
COPY ui/package-lock.json .
COPY ui/src/ ./src/
COPY ui/public/ ./public/
RUN npm install
RUN npm run build

COPY entrypoint.sh /usr/local/bin/
COPY proxy.conf /etc/nginx/conf.d/

WORKDIR /api

ENTRYPOINT ["entrypoint.sh"]

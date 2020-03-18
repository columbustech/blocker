FROM ubuntu:latest

RUN apt-get update && apt-get install -y vim git wget

RUN wget https://dl.google.com/go/go1.13.8.linux-amd64.tar.gz
RUN tar -C /usr/local -xzf go1.13.8.linux-amd64.tar.gz

ENV GOPATH /go
ENV PATH $GOPATH/bin:/usr/local/go/bin:$PATH
ENV GO111MODULE=on

WORKDIR /go/src/github.com/columbustech/sm-mapper/container-manager

COPY ./src/ .

CMD ["sh", "-c", "/bin/bash"]
